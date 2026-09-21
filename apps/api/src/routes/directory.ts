import {
  affiliationInput,
  createRecordInput,
  fullName,
  importInput,
  listedInDirectory,
  matchKey,
  parseRoles,
  signupInput,
  updateRecordInput,
  type DirectoryRecord,
  type ImportOutcome,
  type ImportReport,
  type RecordKind,
} from '@ceed/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as dir from '../db/directory.js';
import {
  accountOfRecord,
  accountStatesByRecord,
  closeAccount,
  createAccount,
  findAccount,
  markInvited,
  reissueProvisionalPassword,
} from '../services/auth.js';
import { HttpError, notFound, parse } from './util.js';
import { workspaceGuard } from './guard.js';

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

  app.get('/api/records', async (req) => {
    const { kind, role, q } = req.query as Record<string, string | undefined>;
    const records = await dir.listRecords({ kind: kind as RecordKind, role, q });
    // An organisation with nobody attached cannot be invited, so the list says so.
    const counts = await dir.linkCounts();
    // Where each person stands on having their own way in. One query for all.
    const accounts = await accountStatesByRecord();
    const rows = records.map((r) => ({
      ...r,
      contacts: counts.get(r.id) ?? 0,
      account: accounts.get(r.id) ?? null,
    }));
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
    const sameEmail =
      Boolean(existing?.email) && existing!.email.trim().toLowerCase() === (input.email ?? '').trim().toLowerCase();
    const namesake = existing && input.kind === 'person' && input.email?.trim() && !sameEmail;
    if (existing && !namesake) {
      throw new HttpError(422, `${existing.name} is already in the directory.`, { name: 'Already in the directory.' });
    }
    const record = await dir.createRecord({ ...input, name });
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
    return dir.updateRecord(id, patch);
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
    await dir.removeRecord(id, plan);
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
   * Sending the invitation. No mail leaves yet — this records that the person
   * has been told, which is the difference between an account nobody knows
   * about and one whose owner has not come to claim it. Inviting an account
   * that is already claimed would say something untrue, so it is refused.
   */
  app.post('/api/records/:id/account/invite', async (req, reply) => {
    const { id } = req.params as { id: string };
    const account = await accountOfRecord(id);
    if (!account) return notFound(reply, 'This person has no account to invite them to.');
    if (account.state === 'claimed') {
      throw new HttpError(422, 'This account is already claimed — there is nothing to invite.');
    }
    await markInvited(account.id);
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

  app.delete('/api/affiliations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await dir.unlinkRecords(id);
    reply.code(204);
  });

  /* ---- Import ---- */

  app.post('/api/records/import', async (req) => {
    const input = parse(importInput, req.body);
    return runImport(input.kind, input.rows, input.dryRun);
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
        email: input.contactEmail,
        city: input.contactCity,
        country: 'Morocco',
        bio: input.contactBio,
      }));

    if (!input.name.trim()) return { contact: person, record: null, joined: false };

    const found = await dir.findByName('org', input.name);
    const org = found
      ? await dir.updateRecord(found.id, {
          email: found.email || input.email,
          website: found.website || input.website,
          city: found.city || input.city,
          bio: found.bio || input.bio,
        })
      : await dir.createRecord({
          kind: 'org',
          name: input.name,
          roles: ['Startup'],
          origin: 'signup',
          email: input.email,
          website: input.website,
          city: input.city,
          country: 'Morocco',
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
async function runImport(kind: RecordKind, rows: Record<string, string>[], dryRun: boolean): Promise<ImportReport> {
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
      email: text(row, 'email'),
      phone: text(row, 'phone'),
      city: text(row, 'city'),
      country: text(row, 'country'),
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
        record = await dir.createRecord({ kind, name, roles, tags, origin: 'import', ...patch });
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
            kind: 'person',
            name: contactName,
            origin: 'import',
            email: text(row, 'contactEmail'),
            city: patch.city,
            country: patch.country,
          });
          people.set(pKey, person);
        }
        await dir.linkRecords({ personId: person.id, orgId: record.id, role: text(row, 'contactRole') || 'Contact' });
      }
    }
  }

  return { created, merged, skipped, contacts, outcomes };
}
