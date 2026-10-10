import {
  ORG_ACCESS,
  affiliationInput,
  createRecordInput,
  fullName,
  importInput,
  listedInDirectory,
  matchKey,
  parseRoles,
  signupInput,
  suggestPassword,
  updateRecordInput,
  type DirectoryRecord,
  type ImportOutcome,
  type ImportReport,
  type RecordKind,
} from '@ceed/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import * as dir from '../db/directory.js';
import {
  accountOfRecord,
  accountStatesByRecord,
  closeAccount,
  createAccount,
  findAccount,
  followRecordEmail,
  reissueProvisionalPassword,
  setAccountDisabled,
} from '../services/auth.js';
import { post, sendingIsLive } from '../services/mail.js';
import { orgRows, peopleRows } from '../services/people.js';
import { invite, inviteBlock, inviteMany } from '../services/invitations.js';
import { HttpError, notFound, parse } from './util.js';
import { requireWorkspaceAdmin, workspaceGuard } from './guard.js';

/** Opening an account on somebody's behalf, with a password they must replace. */
const openAccountInput = z.object({
  /** Defaults to the address already on the record. */
  email: z.string().email('Enter a valid email address.').optional(),
  password: z.string().min(8, 'At least 8 characters.'),
});

export async function directoryRoutes(app: FastifyInstance) {
  // Everything below is the CEED workspace. Public routes name themselves.
  app.addHook('preHandler', workspaceGuard((url) => url.startsWith('/api/public/')));

  /* ---- The two lists are one query ---- */

  /**
   * Le collaborateur qui agit, tel qu'on l'inscrira sur la fiche.
   *
   * Son nom d'annuaire s'il en a un, son adresse sinon : une liste qui dit
   * « s.jennane@ceed-morocco.org » répond tout de même à la question posée,
   * qui est « à qui je demande ».
   */
  const actor = async (req: FastifyRequest) => {
    if (!req.staff) return null;
    const record = await dir.getRecord(req.staff.recordId);
    return { id: req.staff.id, name: record?.name?.trim() || req.staff.email };
  };

  app.get('/api/records', async (req) => {
    const { kind, role, q } = req.query as Record<string, string | undefined>;
    const records = await dir.listRecords({ kind: kind as RecordKind, role, q });
    // An organisation with nobody attached cannot be invited, so the list says so.
    const counts = await dir.linkCounts();
    // Where each person stands on having their own way in. One query for all.
    const accounts = await accountStatesByRecord();
    /* Ce que la liste des individus montre en plus : où ils travaillent, les
       programmes faits et celui en cours. Trois requêtes pour toute la page. */
    const people = kind === 'person' ? await peopleRows() : new Map();
    const orgs = kind === 'org' ? await orgRows() : new Map();
    const rows = records.map((r) => {
      const side = kind === 'org' ? orgs.get(r.id) : people.get(r.id);
      /* Une organisation n'a pas de compte : c'est celui de la personne qui la
         tient qui dit si quelqu'un peut entrer, et c'est ce qu'on vient y
         chercher. */
      const holder = kind === 'org' ? (orgs.get(r.id)?.contacts[0]?.id ?? null) : r.id;
      return {
        ...r,
        contacts: counts.get(r.id) ?? 0,
        account: (holder ? accounts.get(holder) : null) ?? null,
        orgs: people.get(r.id)?.orgs ?? [],
        holders: orgs.get(r.id)?.contacts ?? [],
        alumni: side?.alumni ?? 0,
        current: side?.current ?? [],
      };
    });
    // Somebody a founder typed onto their own team page is content until they
    // come through the door themselves. A search still reaches them — hiding a
    // row from a list is not the same as making a person unfindable.
    return q?.trim() ? rows : rows.filter((r) => listedInDirectory(r, r.account));
  });

  app.get('/api/records/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return (await dir.recordDetail(id)) ?? notFound(reply, 'Record not found.');
  });

  app.post('/api/records', async (req, reply) => {
    const input = parse(createRecordInput, req.body);
    // A person is named by two fields; an organisation by one.
    const name = input.kind === 'person' ? fullName(input.firstName, input.lastName) || input.name : input.name;
    if (!name.trim()) throw new HttpError(422, 'A name is required.', { name: 'A name is required.' });
    const existing = await dir.findByName(input.kind, name);
    // Two organisations may not share a name. Two people may — this file holds
    // five different founders called Ali. What separates them is the address, so
    // a namesake is refused only when nothing tells them apart.
    const asked = (input.emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
    const held = (existing?.emails ?? []).map((e) => e.trim().toLowerCase());
    /* Une adresse en commun, n'importe laquelle : deux fiches qui partagent
       une boîte sont la même personne, et c'est ce qui distingue cinq Ali. */
    const sameEmail = asked.some((e) => held.includes(e));
    const namesake = existing && input.kind === 'person' && asked.length > 0 && !sameEmail;
    if (existing && !namesake) {
      throw new HttpError(422, `${existing.name} is already in the directory.`, { name: 'Already in the directory.' });
    }
    const record = await dir.createRecord({ ...input, name, by: await actor(req) });
    if (input.affiliateTo) {
      const org = await dir.getRecord(input.affiliateTo);
      if (org) {
        await dir.linkRecords(
          record.kind === 'person'
            ? { personId: record.id, orgId: org.id, role: input.affiliationRole, access: input.affiliationAccess }
            : { personId: org.id, orgId: record.id, role: input.affiliationRole, access: input.affiliationAccess },
        );
      }
    }
    reply.code(201);
    return record;
  });

  app.patch('/api/records/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const patch = parse(updateRecordInput, req.body);
    const current = await dir.getRecord(id);
    if (!current) return notFound(reply, 'Record not found.');
    // Editing either half of a person's name moves the display form with it.
    if (current.kind === 'person' && (patch.firstName !== undefined || patch.lastName !== undefined)) {
      patch.name = fullName(patch.firstName ?? current.firstName, patch.lastName ?? current.lastName);
    }
    const saved = await dir.updateRecord(id, patch);
    /* L'identifiant suit l'adresse tant que personne ne tient de lettre qui
       nomme l'ancienne : sans ça, la fiche dit une adresse, le compte en
       attend une autre, et la lettre d'accès donne la première avec le mot de
       passe du second. Rendu à l'écran, parce qu'un identifiant qui change
       sans que rien ne le dise est la même panne dans l'autre sens. */
    const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
    const wanted = patch.emails?.[0];
    const login = wanted !== undefined && !same(wanted, current.email) ? await followRecordEmail(id, wanted) : 'none';
    return { ...saved, login };
  });

  /**
   * What removing this record will take with it — read by the confirmation so
   * it can name the consequences instead of warning in general.
   */
  app.get('/api/records/:id/removal', async (req, reply) => {
    const { id } = req.params as { id: string };
    return (await dir.removalPlan(id)) ?? notFound(reply, 'Record not found.');
  });

  app.delete('/api/records/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const plan = await dir.removalPlan(id);
    if (!plan) return notFound(reply, 'Record not found.');
    // Almost nothing refuses any more: removing somebody means something
    // different depending on what they were, and the plan says which.
    if (plan.blocked.length) throw new HttpError(422, plan.blocked.join(' '));
    await dir.removeRecord(id, plan, req.staff?.email ?? '');
    reply.code(204);
  });

  /* ---- Opening an account for somebody ---- */

  /**
   * CEED can hand a directory record the keys to its own page. The password is
   * provisional by construction: whoever typed it here knows it, so the account
   * is not its owner's until they have chosen another one.
   */
  app.post('/api/records/:id/account', async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = parse(openAccountInput, req.body);
    const record = await dir.getRecord(id);
    if (!record) return notFound(reply, 'Record not found.');
    if (record.kind !== 'person') {
      throw new HttpError(422, 'An account belongs to a person, not to an organisation.');
    }

    const email = (input.email ?? record.email).trim();
    if (!email) throw new HttpError(422, 'This person has no email address.', { email: 'No address on file.' });

    const already = await findAccount(email);
    if (already) {
      // A provisional password may be issued again — it was never theirs, and a
      // password nobody wrote down is worth less than a new one. A password its
      // owner has chosen is never overwritten from here.
      if (already.recordId !== record.id) {
        throw new HttpError(422, 'An account already uses this email.', { email: 'Already taken.' });
      }
      if (!already.mustChangePassword) {
        throw new HttpError(422, 'This account has its own password already.', {
          email: 'Its owner has already chosen a password.',
        });
      }
      await reissueProvisionalPassword(already.id, input.password);
      reply.code(200);
      return { ...(await accountOfRecord(record.id))!, reissued: true };
    }

    if (!record.email) await dir.updateRecord(record.id, { email });

    await createAccount({ email, password: input.password, recordId: record.id, mustChangePassword: true });
    reply.code(201);
    return accountOfRecord(record.id);
  });

  /**
   * Sending the invitation.
   *
   * It carries a password, because an invitation that does not is a letter
   * saying "you have an account somewhere" — the person then writes back to
   * ask how to get in, which is the opposite of what inviting them was for.
   *
   * The password is issued here rather than taken, and it is a fresh one each
   * time: an invitation sent twice is somebody saying the first never arrived,
   * and what has to work is the one in their hand now. Only an account whose
   * password nobody has chosen can be invited — `claimed` is exactly that, so
   * refusing it is what keeps this from being a way to reset a password
   * without saying so.
   */
  app.post('/api/records/:id/account/invite', async (req, reply) => {
    const { id } = req.params as { id: string };
    const record = await dir.getRecord(id);
    if (!record) return notFound(reply, 'Record not found.');

    const blocked = await inviteBlock(id);
    if (blocked === 'claimed') {
      throw new HttpError(422, 'This account is already claimed — there is nothing to invite.');
    }
    if (blocked === 'disabled') {
      throw new HttpError(422, 'This account is switched off — inviting somebody into it would be a dead end.');
    }
    if (blocked === 'no_email') {
      throw new HttpError(422, 'There is no address to write to.', { email: 'Add one first.' });
    }

    const out = await invite(id);
    /* The password goes back once, the way opening an account does: whoever
       pressed this is often on the phone with the person, and the letter can
       take a minute. Whether it actually left is said rather than assumed. */
    return { ...(await accountOfRecord(id))!, password: out.password, emailed: out.emailed };
  });

  /**
   * Inviting a list.
   *
   * Spread over days on purpose: a sending domain with no reputation that
   * writes four hundred letters on its first morning is classed as spam, and
   * from then on the jury convocations and the results go to the same place.
   * A few days once, against a whole season.
   */
  app.post('/api/records/invite-many', async (req, reply) => {
    requireWorkspaceAdmin(req);
    const input = parse(
      z.object({
        recordIds: z.array(z.string()).min(1, 'Pick at least one person.').max(2000),
        perDay: z.number().int().min(1).max(2000).nullable().default(null),
      }),
      req.body,
    );
    const out = await inviteMany(input.recordIds, input.perDay);
    reply.code(202);
    return out;
  });

  /**
   * Handing out a new password, whoever chose the last one.
   *
   * Opening an account refuses to overwrite a password its owner has chosen —
   * on purpose, so a routine act cannot quietly lock somebody out. This is the
   * deliberate one: an administrator, asked by somebody who cannot get in.
   * It generates the password rather than taking one, so nothing weak arrives
   * from a caller, and returns it exactly once — it is never stored in the
   * clear and cannot be read back.
   */
  app.post('/api/records/:id/account/password', async (req, reply) => {
    requireWorkspaceAdmin(req);
    const { id } = req.params as { id: string };
    const account = await accountOfRecord(id);
    if (!account) return notFound(reply, 'This person has no account.');
    const record = await dir.getRecord(id);
    const password = suggestPassword();
    await reissueProvisionalPassword(account.id, password);

    /* Posted as well as shown. The screen shows it once because somebody is
       often on the phone with the person; the message is for the case where
       they are not, and for the person who writes it down wrong. */
    const letter = await post({
      kind: 'password_reset',
      to: account.email,
      toName: record?.name ?? '',
      recordId: id,
      subject: 'Your CEED password has been reset',
      body: [
        `${record?.name ? `${record.name},` : 'Hello,'}`,
        '',
        'CEED has given your account a new password. Sign in with it and you will be asked to choose your own.',
        '',
        `    ${password}`,
        '',
        'Anything you had open has been signed out. If this was not expected, tell CEED — somebody there did it on purpose.',
      ].join('\n'),
    });

    // Provisional again: whoever reads this screen knows it, so it is not
    // theirs until they have replaced it. Their sessions end with the old one.
    return { account: await accountOfRecord(id), password, emailed: sendingIsLive() && Boolean(letter) };
  });

  /**
   * Closing the way in, or opening it again. Not a deletion: the account keeps
   * its email and its history, the person keeps their record, and every mark
   * they gave stays theirs. Only signing in stops — including for whoever was
   * already signed in, whose sessions end with it.
   */
  app.patch('/api/records/:id/account', async (req, reply) => {
    requireWorkspaceAdmin(req);
    const { id } = req.params as { id: string };
    const input = parse(z.object({ disabled: z.boolean() }), req.body);
    const account = await accountOfRecord(id);
    if (!account) return notFound(reply, 'This person has no account.');
    // Disabling your own account would sign you out of the workspace with no
    // way back in, and CEED would have one administrator fewer by accident.
    if (input.disabled && account.id === req.staff?.id) {
      throw new HttpError(422, 'You cannot close your own account from here.');
    }
    await setAccountDisabled(account.id, input.disabled);
    return accountOfRecord(id);
  });

  /**
   * Closing an account. The person stays in the directory — they are still a
   * juror, a founder, a contact; what goes is their way in. Sessions end with
   * it, so whoever was signed in is signed out.
   */
  app.delete('/api/records/:id/account', async (req, reply) => {
    const { id } = req.params as { id: string };
    const account = await accountOfRecord(id);
    if (!account) return notFound(reply, 'This person has no account.');
    await closeAccount(account.id);
    reply.code(204);
  });

  /* ---- Affiliations ---- */

  app.post('/api/affiliations', async (req, reply) => {
    const input = parse(affiliationInput, req.body);
    const [person, org] = await Promise.all([dir.getRecord(input.personId), dir.getRecord(input.orgId)]);
    if (!person || person.kind !== 'person') throw new HttpError(422, 'That is not a person.');
    if (!org || org.kind !== 'org') throw new HttpError(422, 'That is not an organisation.');
    reply.code(201);
    return dir.linkRecords(input);
  });

  /**
   * Ce que quelqu'un est dans cette organisation-là.
   *
   * Not the same thing as their job, which lives on their own record: a person
   * can be a founder in one place and a mentor in another, and the two lines
   * read side by side on the same screen. What was missing is that this one
   * could not be corrected at all — a wrong word stayed there until somebody
   * unlinked the two and started again.
   */
  app.patch('/api/affiliations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = parse(z.object({ role: z.string().optional(), access: z.enum(ORG_ACCESS).optional() }), req.body);
    const found = await dir.affiliationById(id);
    if (!found) return notFound(reply, 'That link no longer exists.');
    await dir.setAffiliation(id, input);
    return dir.affiliationById(id);
  });

  app.delete('/api/affiliations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await dir.unlinkRecords(id);
    reply.code(204);
  });

  /* ---- Import ---- */

  app.post('/api/records/import', async (req) => {
    const input = parse(importInput, req.body);
    return runImport(input.kind, input.rows, input.dryRun, await actor(req));
  });

  /* ---- Registering yourself ---- */

  app.post('/api/public/join', async (req) => {
    const input = parse(signupInput, req.body);

    // The person is who is filling this in, so they always exist. Joining a
    // record CEED already typed in beats creating a twin of it.
    const person =
      (await dir.findByName('person', input.contactName)) ??
      (await dir.createRecord({
        kind: 'person',
        name: input.contactName,
        origin: 'signup',
        emails: [input.contactEmail],
        places: input.contactCity.trim() ? [{ city: input.contactCity.trim(), country: 'Morocco' }] : [],
        bio: input.contactBio,
      }));

    if (!input.name.trim()) return { contact: person, record: null, joined: false };

    const found = await dir.findByName('org', input.name);
    const org = found
      ? await dir.updateRecord(found.id, {
          email: found.email || input.email,
          website: found.website || input.website,
          places: found.places.length
            ? found.places
            : input.city.trim()
              ? [{ city: input.city.trim(), country: 'Morocco' }]
              : [],
          bio: found.bio || input.bio,
        })
      : await dir.createRecord({
          kind: 'org',
          name: input.name,
          roles: ['Startup'],
          origin: 'signup',
          emails: input.email.trim() ? [input.email.trim()] : [],
          website: input.website,
          places: input.city.trim() ? [{ city: input.city.trim(), country: 'Morocco' }] : [],
          bio: input.bio,
        });

    await dir.linkRecords({ personId: person.id, orgId: org!.id, role: input.contactRole || 'Contact' });
    return { contact: person, record: org, joined: Boolean(found) };
  });

  app.get('/api/public/join/check', async (req) => {
    const { name } = req.query as { name?: string };
    if (!name?.trim()) return { found: null };
    const org = await dir.findByName('org', name);
    return { found: org ? { name: org.name, origin: org.origin } : null };
  });
}

/* ------------------------------------------------------------------ */
/* The import itself                                                   */
/* ------------------------------------------------------------------ */

const text = (row: Record<string, string>, key: string) => (row[key] ?? '').trim();

/**
 * Rows already mapped onto the model's columns. An existing record is completed
 * rather than overwritten — an import never destroys what someone typed.
 */
async function runImport(
  kind: RecordKind,
  rows: Record<string, string>[],
  dryRun: boolean,
  /** Qui importe : le fichier dit d'où, lui dit de qui. */
  who: { id: string; name: string } | null,
): Promise<ImportReport> {
  const existing = await dir.listRecords({ kind });
  const known = new Map(existing.map((r) => [matchKey(r.name), r] as const));
  const people = new Map((await dir.listRecords({ kind: 'person' })).map((r) => [matchKey(r.name), r] as const));

  const outcomes: ImportOutcome[] = [];
  let created = 0;
  let merged = 0;
  let skipped = 0;
  let contacts = 0;

  for (const [index, row] of rows.entries()) {
    const name = text(row, 'name');
    const at = index + 1;
    if (!name) {
      skipped++;
      outcomes.push({ row: at, name: '', action: 'skipped', reason: 'No name in this row.', contact: null });
      continue;
    }

    const key = matchKey(name);
    const hit = known.get(key);
    const contactName = kind === 'org' ? text(row, 'contactName') : '';
    const patch = {
      emails: text(row, 'email')
        .split(/[,;]/)
        .map((e) => e.trim())
        .filter(Boolean),
      /* Une colonne, un numéro : un fichier qui en porte deux les sépare par
         une virgule ou un point-virgule, et c'est ce que les gens font. */
      phones: text(row, 'phone')
        .split(/[,;]/)
        .map((n) => n.trim())
        .filter(Boolean),
      /* Une ligne de fichier porte une ville et un pays : c'est un lieu, et
         la liste en commence un. */
      places: text(row, 'city').trim() || text(row, 'country').trim()
        ? [{ city: text(row, 'city').trim(), country: text(row, 'country').trim() }]
        : [],
      website: text(row, 'website'),
      bio: text(row, 'bio'),
    };
    const roles = parseRoles(text(row, 'roles'), kind);
    const tags = text(row, 'tags')
      .split(/[,;|]/)
      .map((t) => t.trim())
      .filter(Boolean);

    let record: DirectoryRecord | null = hit ?? null;

    if (hit) {
      // Only fill what is empty, and add roles and tags rather than replacing them.
      const fill: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) if (v && !hit[k as keyof DirectoryRecord]) fill[k] = v;
      const nextRoles = [...new Set([...hit.roles, ...roles])];
      const nextTags = [...new Set([...hit.tags, ...tags])];
      if (nextRoles.length !== hit.roles.length) fill.roles = nextRoles;
      if (nextTags.length !== hit.tags.length) fill.tags = nextTags;

      if (!Object.keys(fill).length && !contactName) {
        skipped++;
        outcomes.push({ row: at, name, action: 'skipped', reason: 'Already in the directory, nothing to add.', contact: null });
        continue;
      }
      merged++;
      outcomes.push({
        row: at,
        name,
        action: 'merged',
        reason: Object.keys(fill).length ? `Completed: ${Object.keys(fill).join(', ')}.` : 'Contact added.',
        contact: contactName || null,
      });
      if (!dryRun) record = await dir.updateRecord(hit.id, fill);
    } else {
      created++;
      outcomes.push({
        row: at,
        name,
        action: 'created',
        reason: roles.length ? `New, as ${roles.join(' and ')}.` : 'New record.',
        contact: contactName || null,
      });
      if (!dryRun) {
        record = await dir.createRecord({ kind, name, roles, tags, origin: 'import', ...patch, by: who });
        known.set(key, record);
      } else {
        known.set(key, { id: 'preview', name } as DirectoryRecord);
      }
    }

    /* An organisation arrives with the person who holds it, in the same row. */
    if (kind === 'org' && contactName) {
      contacts++;
      if (!dryRun && record) {
        const pKey = matchKey(contactName);
        let person = people.get(pKey) ?? null;
        if (!person) {
          person = await dir.createRecord({
            by: who,
            kind: 'person',
            name: contactName,
            origin: 'import',
            emails: text(row, 'contactEmail').trim() ? [text(row, 'contactEmail').trim()] : [],
            places: patch.places,
          });
          people.set(pKey, person);
        }
        await dir.linkRecords({ personId: person.id, orgId: record.id, role: text(row, 'contactRole') || 'Contact' });
      }
    }
  }

  return { created, merged, skipped, contacts, outcomes };
}
