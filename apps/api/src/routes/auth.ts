import {
  blockStatus,
  canEditOrg,
  canManageTeam,
  changePasswordInput,
  contactProblemsIn,
  CONTACT_SAYS,
  fullName,
  orderedBlocks,
  loginInput,
  myOrgInput,
  profileInput,
  signupAccountInput,
  suggestPassword,
  revenueInput,
  profileOf,
  SHEET_LISTS,
  sheetListInput,
  teamProblems,
  taskItemPatch,
  taskPatch,
  teamMemberInput,
  teamMemberPatch,
  type BrickStatus,
  type EditionStatus,
  type Me,
  type StaffRole,
  type TeamInvite,
} from '@ceed/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import * as dir from '../db/directory.js';
import * as repo from '../db/repo.js';
import { changeItem, changeTask, getTask, listTasks } from '../services/tasks.js';
import { addOrgDocument, changeOrgDocument, saveNeed } from '../services/orgSheet.js';
import { agendaFor } from '../services/agenda.js';
import { deliverablesFor } from '../services/deliverables.js';
import { panelFor, reviewsFor, whyNoPanel } from '../services/reviews.js';
import {
  SESSION_COOKIE,
  accountForToken,
  accountOfRecord,
  adminCount,
  clearFailedLogins,
  loginAllowed,
  noteFailedLogin,
  closeAccount,
  createAccount,
  createSession,
  endSession,
  findAccount,
  markInvited,
  reissueProvisionalPassword,
  setPassword,
  verifyPassword,
  RESET_MINUTES,
  dropReset,
  issueReset,
  resetRequestedRecently,
  useReset,
} from '../services/auth.js';
import { post } from '../services/mail.js';
import { appLink } from '../services/deliverables.js';
import { HttpError, notFound, parse } from './util.js';

/** One published edition, as the person signed in sees it. */
interface MyProgram {
  programId: string;
  programName: string;
  editionId: string;
  editionName: string;
  editionStatus: EditionStatus;
  city: string;
  startsOn: string | null;
  endsOn: string | null;
  /** Read from the Application brick. Null when the edition has no form at all. */
  applications: BrickStatus | null;
  opensAt: string | null;
  applyUrl: string | null;
  /** Candidacies of the organisations this person belongs to. */
  mine: { id: string; orgName: string }[];
}

/** Open first, then what is coming, then what is over. */
const RANK: Record<BrickStatus, number> = { live: 0, scheduled: 1, closed: 2, not_configured: 3 };

/** What a reviewer may send. Notably not who they are — that comes from the session. */
const reviewScoreInput = z.object({
  candidateId: z.string(),
  marks: z.record(z.number()).default({}),
  verdict: z.string().optional(),
  comment: z.string().optional(),
  submit: z.boolean().optional(),
});

/** Sets the session cookie. Same-origin through the dev proxy, so httpOnly works. */
function setSession(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
    secure: process.env.NODE_ENV === 'production',
  });
}

/** Everything the member space needs about whoever is signed in. */
async function meFor(account: {
  id: string;
  email: string;
  recordId: string;
  mustChangePassword?: boolean;
  staffRole?: StaffRole | null;
}): Promise<Me> {
  const record = await dir.getRecord(account.recordId);
  if (!record) throw new HttpError(401, 'This account has no profile.');
  return {
    account: {
      id: account.id,
      email: account.email,
      mustChangePassword: account.mustChangePassword ?? false,
      staffRole: account.staffRole ?? null,
    },
    record,
    organisations: await dir.linksOf(record),
  };
}

/**
 * Les programmes d'un membre, vus de sa place.
 *
 * Lifted out of its route so that the preview CEED opens of a startup's page
 * runs this and not a second rendering of the same idea. A preview written
 * twice is a preview that drifts, and one that drifts is worse than none: it
 * is checked, it looks right, and the founder sees something else.
 */
export async function programsFor(recordId: string): Promise<MyProgram[]> {
  const record = await dir.getRecord(recordId);
  const mine = new Set(record ? (await dir.linksOf(record)).map((l) => l.record.id) : []);
  const programs = await repo.listPrograms();
  const out: MyProgram[] = [];

  for (const program of programs) {
    for (const edition of program.editions) {
      if (edition.status === 'Draft') continue;
      const detail = await repo.getEditionDetail(edition.id);
      if (!detail) continue;

      const forms = detail.tracks.flatMap((t) => orderedBlocks(t)).filter((b) => b.type === 'application');
      const state = forms.length
        ? forms.map((b) => blockStatus(b)).sort((a, b) => RANK[a] - RANK[b])[0]
        : null;
      const opensAt = forms.map((b) => (b.config as { opensAt?: string | null }).opensAt).find(Boolean) ?? null;

      // A candidacy of one of their own organisations, which is the only part
      // of this screen that is about them rather than about the programme.
      const candidacies = (await repo.listCandidates(edition.id))
        .filter((c) => mine.has(c.orgId))
        .map((c) => ({ id: c.id, orgName: c.orgName }));

      out.push({
        programId: program.id,
        programName: program.name,
        editionId: edition.id,
        editionName: edition.name,
        editionStatus: edition.status,
        city: edition.city,
        startsOn: edition.startsOn,
        endsOn: edition.endsOn,
        applications: edition.status === 'Completed' ? 'closed' : state,
        opensAt,
        applyUrl: state === 'live' && forms[0] ? `/apply/${forms[0].id}` : null,
        mine: candidacies,
      });
    }
  }
  return out;
}

export async function authRoutes(app: FastifyInstance) {
  /**
   * Reads the signed-in account, or refuses. A provisional password is refused
   * here rather than only hidden in the interface: the rule is that the session
   * it opens can do one thing, and that has to hold for anything that talks to
   * this API.
   */
  const require = async (req: FastifyRequest, allowProvisional = false) => {
    const account = await accountForToken(req.cookies[SESSION_COOKIE]);
    if (!account) throw new HttpError(401, 'Sign in to continue.');
    if (account.mustChangePassword && !allowProvisional) {
      throw new HttpError(403, 'Choose your own password before going further.', { mustChangePassword: 'true' });
    }
    return account;
  };

  /* ---- Creating an account ---- */

  app.post('/api/auth/signup', async (req, reply) => {
    const input = parse(signupAccountInput, req.body);
    if (await findAccount(input.email)) {
      throw new HttpError(422, 'An account already uses this email.', { email: 'Already taken — sign in instead.' });
    }

    const name = fullName(input.firstName, input.lastName);
    // Somebody CEED already typed in becomes the account's profile rather than a
    // second copy of the same person — unless that record is already somebody
    // else's. A namesake is not the same person, and five founders called Ali
    // came through the import to prove it.
    const sameName = await dir.findByName('person', name);
    const existing = sameName && !(await accountOfRecord(sameName.id)) ? sameName : null;
    const record =
      existing ??
      (await dir.createRecord({
        kind: 'person',
        name,
        firstName: input.firstName,
        lastName: input.lastName,
        emails: [input.email],
        places: [],
        origin: 'signup',
      }));
    if (existing) {
      await dir.updateRecord(existing.id, {
        firstName: existing.firstName || input.firstName,
        lastName: existing.lastName || input.lastName,
        email: existing.email || input.email,
      });
    }

    const account = await createAccount({ email: input.email, password: input.password, recordId: record.id });
    const { token, expiresAt } = await createSession(account.id);
    setSession(reply, token, expiresAt);
    reply.code(201);
    return meFor({ ...account, recordId: record.id });
  });

  /* ---- Signing in ---- */

  app.post('/api/auth/login', async (req, reply) => {
    const input = parse(loginInput, req.body);

    /* Counted before the password is even looked at, so a machine guessing in
       a loop is stopped rather than merely refused each time. */
    const gate = await loginAllowed(input.email, req.ip);
    if (!gate.allowed) {
      reply.header('retry-after', String(gate.retryAfter));
      throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    }

    let account = await findAccount(input.email);
    // The same refusal whether the email is unknown or the password is wrong:
    // otherwise this endpoint tells anyone who has an account here.
    const usual = account ? await verifyPassword(input.password, account.passwordHash) : false;
    /* Ou le mot de passe envoyé par « mot de passe oublié », pendant son heure :
       il devient le mot de passe, provisoire, et l'écran suivant en demande un
       à soi. */
    const mailed = account && !usual ? await useReset(account.id, input.password) : false;
    if (!account || (!usual && !mailed)) {
      await noteFailedLogin(input.email, req.ip);
      throw new HttpError(401, 'Email or password is wrong.');
    }
    if (mailed) account = (await findAccount(input.email))!;
    // Le mot de passe habituel a marché : la demande de réinitialisation, s'il
    // y en avait une, ne sert plus à rien et ne doit pas rester valable.
    else await dropReset(account.id);

    // A disabled account is told so plainly. Hiding it behind "email or
    // password is wrong" would send somebody to reset a password that works,
    // and the fact is not a secret: they are being told by CEED, not guessing.
    if (account.disabledAt) {
      throw new HttpError(403, 'This account has been closed. Ask CEED to open it again.');
    }

    // Getting in is proof of the right to; the record of the fumbling goes.
    await clearFailedLogins(input.email);
    const { token, expiresAt } = await createSession(account.id);
    setSession(reply, token, expiresAt);
    return meFor(account);
  });

  /**
   * Mot de passe oublié.
   *
   * La même réponse que l'adresse ait un compte ou non : sinon ce formulaire
   * dirait à n'importe qui qui est inscrit ici. Rien n'est remplacé — un
   * second mot de passe part par mail, valable une heure, à côté du premier.
   * Compté comme une tentative de connexion, pour qu'une machine ne s'en
   * serve pas en boucle.
   */
  app.post('/api/auth/forgot', async (req, reply) => {
    const { email } = parse(z.object({ email: z.string().trim().min(1, 'Your email.') }), req.body);
    const gate = await loginAllowed(email, req.ip);
    if (!gate.allowed) {
      reply.header('retry-after', String(gate.retryAfter));
      throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    }
    await noteFailedLogin(email, req.ip);

    const account = await findAccount(email);
    if (account && !account.disabledAt && !(await resetRequestedRecently(account.id))) {
      const password = suggestPassword();
      await issueReset(account.id, password);
      const record = await dir.getRecord(account.recordId);
      const origin = await appLink();
      const login = origin ? origin.replace(/\/me\?tab=Programs$/, '/login') : '';
      await post({
        kind: 'password_reset',
        to: account.email,
        toName: record?.name ?? '',
        recordId: account.recordId,
        subject: 'Votre mot de passe CEED — Your CEED password',
        body: [
          record?.name ? `${record.name},` : 'Bonjour,',
          '',
          `Vous avez demandé un nouveau mot de passe. Le voici — il est valable ${RESET_MINUTES} minutes, et vous en choisirez un à vous en vous connectant :`,
          '',
          `    ${account.email}`,
          `    ${password}`,
          '',
          ...(login ? [`    ${login}`, ''] : []),
          'Votre mot de passe actuel continue de fonctionner : si vous n’avez rien demandé, ignorez ce message.',
          '',
          '—',
          '',
          `You asked for a new password. Here it is — it works for ${RESET_MINUTES} minutes, and you will choose your own when you sign in. Your current password still works: if you did not ask, ignore this message.`,
        ].join('\n'),
      });
    }
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    await endSession(req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    reply.code(204);
  });

  /**
   * Replacing the password. Signing in with a provisional one lands here and
   * nowhere else, so this is the single route that accepts such a session.
   */
  app.post('/api/me/password', async (req, reply) => {
    const account = await require(req, true);
    const input = parse(changePasswordInput, req.body);

    const stored = await findAccount(account.email);
    if (!stored || !(await verifyPassword(input.currentPassword, stored.passwordHash))) {
      throw new HttpError(422, 'That is not your current password.', {
        currentPassword: 'This does not match.',
      });
    }

    await setPassword(account.id, input.newPassword, req.cookies[SESSION_COOKIE]);
    reply.code(200);
    return meFor({ ...account, mustChangePassword: false });
  });

  app.get('/api/auth/me', async (req, reply) => {
    const account = await accountForToken(req.cookies[SESSION_COOKIE]);
    if (!account) return reply.code(401).send({ error: 'Not signed in.' });
    return meFor(account);
  });

  /* ---- The profile is the directory record ---- */

  app.patch('/api/me', async (req) => {
    const account = await require(req);
    const input = parse(profileInput, req.body);
    /* The display name follows the two halves — but only when they say
       something. A record entered as one name has neither half, so recomputing
       from them would rewrite the person's name as empty: saving a phone
       number would cost you your name. */
    const both = fullName(input.firstName, input.lastName);
    await dir.updateRecord(account.recordId, {
      ...input,
      ...(both ? { name: both } : {}),
    });
    return meFor(account);
  });

  /* ---- Organisation pages, created by their own people ---- */

  app.post('/api/me/organisations', async (req, reply) => {
    const account = await require(req);
    const input = parse(myOrgInput, req.body);

    const { org, joined } = await dir.openOrganisation(account.recordId, input);
    reply.code(201);
    return { organisation: org, joined };
  });

  /* ---- The programmes CEED has published ---- */

  /**
   * What a member sees of the programmes: the editions that are not drafts, and
   * whether their application is open — read from the Application brick itself,
   * never from a line somebody typed. A form whose door is shut says so here,
   * and closing the brick is the only way to say it.
   */
  /**
   * Ce qu'on attend de moi, et de mes sociétés.
   *
   * Une tâche confiée à une startup est vue par tous ceux qui tiennent sa
   * page : c'est l'intérêt de pouvoir la confier à une société plutôt qu'à
   * quelqu'un en particulier — le premier qui s'en occupe la coche.
   */
  app.get('/api/me/tasks', async (req) => {
    const account = await require(req);
    const mine = [account.recordId, ...(await dir.orgIdsOf(account.recordId))];
    return listTasks({ ownerIds: mine, open: true });
  });

  /** La cocher, et seulement si elle est à moi. */
  app.patch('/api/me/tasks/:id', async (req, reply) => {
    const account = await require(req);
    const { id } = req.params as { id: string };
    const task = await getTask(id);
    const mine = [account.recordId, ...(await dir.orgIdsOf(account.recordId))];
    if (!task || !mine.includes(task.ownerId)) return notFound(reply, 'Task not found.');
    const who = await dir.getRecord(account.recordId);
    /* Rien d'autre que l'état : le texte et l'échéance appartiennent à qui l'a
       demandée. */
    const { state } = parse(taskPatch.pick({ state: true }), req.body);
    return changeTask(id, { state }, { id: account.recordId, name: who?.name ?? '' });
  });

  /** Cocher une ligne de sa checklist — la cocher, pas la réécrire. */
  app.patch('/api/me/tasks/:id/items/:itemId', async (req, reply) => {
    const account = await require(req);
    const { id, itemId } = req.params as { id: string; itemId: string };
    const task = await getTask(id);
    const mine = [account.recordId, ...(await dir.orgIdsOf(account.recordId))];
    if (!task || !mine.includes(task.ownerId)) return notFound(reply, 'Task not found.');
    const who = await dir.getRecord(account.recordId);
    const { done } = parse(taskItemPatch.pick({ done: true }).required(), req.body);
    if (!(await changeItem(id, itemId, { done }, { id: account.recordId, name: who?.name ?? '' }))) {
      return notFound(reply, 'Item not found.');
    }
    return getTask(id);
  });

  app.get('/api/me/programs', async (req) => {
    const account = await require(req);
    return programsFor(account.recordId);
  });

  /* ---- What a startup still owes ---- */

  /**
   * The items a candidacy has been asked for, and what it has sent.
   *
   * Scoped to the organisations this person belongs to: being able to read a
   * document request is being able to read who else was asked, and only one
   * startup's own file is theirs.
   */
  app.get('/api/me/deliverables/:candidateId', async (req, reply) => {
    const account = await require(req);
    const { candidateId } = req.params as { candidateId: string };
    const candidate = await repo.getCandidate(candidateId);
    if (!candidate) return notFound(reply, 'Candidacy not found.');
    if (!(await dir.orgIdsOf(account.recordId)).has(candidate.orgId)) {
      return notFound(reply, 'Candidacy not found.');
    }
    return deliverablesFor(candidate.editionId, candidate);
  });

  /**
   * Ce qui vient, pour une de leurs candidatures.
   *
   * Scoped the same way as the documents: a date is as much theirs as the list
   * of pieces, and neither is anybody else's to read.
   */
  app.get('/api/me/agenda/:candidateId', async (req, reply) => {
    const account = await require(req);
    const { candidateId } = req.params as { candidateId: string };
    const candidate = await repo.getCandidate(candidateId);
    if (!candidate) return notFound(reply, 'Candidacy not found.');
    if (!(await dir.orgIdsOf(account.recordId)).has(candidate.orgId)) {
      return notFound(reply, 'Candidacy not found.');
    }
    return agendaFor(candidateId);
  });

  /** Handing one item in. The brick has to be open, the same as a form does. */
  app.post('/api/me/deliverables/:candidateId', async (req, reply) => {
    const account = await require(req);
    const { candidateId } = req.params as { candidateId: string };
    const input = parse(z.object({ blockId: z.string(), itemId: z.string(), value: z.unknown() }), req.body);

    const candidate = await repo.getCandidate(candidateId);
    if (!candidate) return notFound(reply, 'Candidacy not found.');
    if (!(await dir.orgIdsOf(account.recordId)).has(candidate.orgId)) {
      return notFound(reply, 'Candidacy not found.');
    }

    const owed = await deliverablesFor(candidate.editionId, candidate);
    const asked = owed.find((o) => o.block.id === input.blockId);
    // Not on this list is the same answer as not existing: a request belongs to
    // the startups it was made of.
    if (!asked) return notFound(reply, 'Nothing is being asked of you there.');
    if (!asked.config.items.some((i) => i.id === input.itemId)) {
      return notFound(reply, 'That is not one of the things being asked for.');
    }
    const block = await repo.getBlock(input.blockId);
    if (!block || blockStatus(block) !== 'live') {
      throw new HttpError(403, 'That list is not open. Ask the team if you still need to send something.');
    }

    /* Une adresse ou un numéro fautif est refusé ici aussi : l'écran le dit en
       écrivant, mais c'est l'API qui garde le fichier, et une règle qui ne vit
       que dans la page n'en est pas une. */
    const item = asked.config.items.find((i) => i.id === input.itemId)!;
    const wrong = contactProblemsIn(item, input.value);
    if (Object.keys(wrong).length) {
      const [, problem] = Object.entries(wrong)[0]!;
      throw new HttpError(422, CONTACT_SAYS[problem as 'email' | 'phone'], {
        [input.itemId]: CONTACT_SAYS[problem as 'email' | 'phone'],
      });
    }

    await repo.saveReturn(input.blockId, candidateId, input.itemId, input.value ?? null);
    await repo.claimUploads(candidateId, { [input.itemId]: input.value });
    return deliverablesFor(candidate.editionId, candidate);
  });

  /* ---- Closing your own account ---- */

  /**
   * Closes the account, and only the account. The directory record stays, with
   * every candidacy, panel and mark attached to it: those are the programme's
   * history, not this person's login, and deleting them here would quietly
   * rewrite a jury's work. CEED can issue a new password afterwards.
   */
  app.delete('/api/me', async (req, reply) => {
    const account = await require(req);
    if (account.staffRole === 'admin') {
      const admins = await adminCount();
      if (admins <= 1) {
        throw new HttpError(422, 'You are the only CEED administrator — name another one first.');
      }
    }
    await closeAccount(account.id);
    await endSession(req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    reply.code(204);
    return null;
  });

  /* ---- Reviewing, for whoever sits on a panel ---- */

  app.get('/api/me/reviews', async (req) => {
    const account = await require(req);
    return reviewsFor(account.recordId);
  });

  app.get('/api/me/reviews/:sessionId', async (req, reply) => {
    const account = await require(req);
    const { sessionId } = req.params as { sessionId: string };
    const panel = await panelFor(account.recordId, sessionId);
    if (panel) return panel;
    const why = await whyNoPanel(account.recordId, sessionId);
    return notFound(reply, why === 'closed' ? 'This panel is closed.' : 'You are not on that panel.');
  });

  /**
   * Scoring as yourself. The evaluator is taken from the session and never from
   * the request, so nobody can file marks under somebody else's name.
   */
  app.post('/api/me/reviews/:sessionId/scores', async (req, reply) => {
    const account = await require(req);
    const { sessionId } = req.params as { sessionId: string };
    const input = parse(reviewScoreInput, req.body);

    const panel = await panelFor(account.recordId, sessionId);
    if (!panel) {
      const why = await whyNoPanel(account.recordId, sessionId);
      return notFound(reply, why === 'closed' ? 'This panel is closed.' : 'You are not on that panel.');
    }
    if (!panel.evaluation) throw new HttpError(422, 'Nothing scores this panel yet.');
    // A deadline that was set closes the evaluator space on it. An empty one
    // never closes anything.
    if (panel.state === 'closed') {
      // Closed by hand carries its own date; a deadline carries the planned one.
      const on = panel.closedAt ?? panel.closesAt;
      throw new HttpError(
        403,
        on ? `Reviewing closed on ${on}. Ask the team if you still need to file.` : 'Reviewing is closed.',
      );
    }
    if (panel.state === 'not_open') {
      throw new HttpError(403, 'Reviewing opens on ' + panel.opensAt + '.');
    }
    if (!panel.items.some((i) => i.candidate.id === input.candidateId)) {
      throw new HttpError(403, 'That startup is not on your list.');
    }

    const record = await dir.getRecord(account.recordId);
    if (input.submit) {
      if (panel.evaluation.requireComment && !input.comment?.trim()) {
        throw new HttpError(422, 'This panel asks every reviewer for a comment.', {
          comment: 'Add a comment before submitting.',
        });
      }
      if (panel.evaluation.method === 'verdict' && !input.verdict) {
        throw new HttpError(422, 'Pick a verdict before submitting.');
      }
    }

    // A review emptied back to nothing is a draft again — 'sent' has to mean
    // something was.
    const empty =
      panel.evaluation.method === 'verdict' ? !input.verdict : Object.keys(input.marks).length === 0;

    await repo.upsertScore({
      blockId: panel.evaluation.blockId,
      candidateId: input.candidateId,
      evaluatorId: account.recordId,
      evaluatorName: record?.name ?? '',
      sessionId,
      marks: input.marks,
      verdict: input.verdict ?? '',
      comment: input.comment ?? '',
      submit: input.submit ?? false,
      reopen: !input.submit && empty,
    });
    return panelFor(account.recordId, sessionId);
  });

  /**
   * What the signed-in person may do on one organisation. Belonging is no longer
   * the whole answer: a member is on the page without holding it.
   */
  const accessTo = async (req: FastifyRequest, orgId: string) => {
    const account = await require(req);
    const access = await dir.accessOf(account.recordId, orgId);
    if (!access) throw new HttpError(403, 'You are not attached to that organisation.');
    return { account, access };
  };

  app.patch('/api/me/organisations/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { access } = await accessTo(req, id);
    if (!canEditOrg(access)) {
      throw new HttpError(403, 'Only an editor or an administrator can change this page.');
    }
    const patch = parse(myOrgInput.omit({ myRole: true }).partial(), req.body);
    /* Ce qui ne peut pas être vrai à la fois est refusé ici, contre la fiche
       telle qu'elle sera : le champ envoyé seul ne dit rien de l'autre. */
    const current = await dir.getRecord(id);
    const wrong = teamProblems(profileOf({ ...current!, ...patch }));
    if (Object.keys(wrong).length) throw new HttpError(422, Object.values(wrong)[0]!, wrong);
    return dir.updateRecord(id, patch);
  });

  /* Les besoins et les documents, par qui peut modifier la page. Les
     documents sont privés : la fiche entière qu'on rend ici ne part qu'à
     quelqu'un de l'organisation. */
  const canEdit = async (req: FastifyRequest, id: string) => {
    const { account, access } = await accessTo(req, id);
    if (!canEditOrg(access)) throw new HttpError(403, 'Only an editor or an administrator can change this page.');
    return account;
  };
  app.put('/api/me/organisations/:id/needs/:need', async (req) => {
    const { id, need } = req.params as { id: string; need: string };
    await canEdit(req, id);
    await saveNeed(id, need, req.body);
    return dir.getRecord(id);
  });
  app.delete('/api/me/organisations/:id/needs/:need', async (req, reply) => {
    const { id, need } = req.params as { id: string; need: string };
    await canEdit(req, id);
    return (await dir.dropNeed(id, need)) ? dir.getRecord(id) : notFound(reply, 'No such need on this page.');
  });
  app.post('/api/me/organisations/:id/documents', async (req, reply) => {
    const { id } = req.params as { id: string };
    const account = await canEdit(req, id);
    const who = await dir.getRecord(account.recordId);
    await addOrgDocument(id, req.body, who?.name ?? '');
    reply.code(201);
    return dir.getRecord(id);
  });
  app.patch('/api/me/organisations/:id/documents/:docId', async (req, reply) => {
    const { id, docId } = req.params as { id: string; docId: string };
    await canEdit(req, id);
    return (await changeOrgDocument(id, docId, req.body)) ? dir.getRecord(id) : notFound(reply, 'Not on this page.');
  });
  app.delete('/api/me/organisations/:id/documents/:docId', async (req, reply) => {
    const { id, docId } = req.params as { id: string; docId: string };
    await canEdit(req, id);
    return (await dir.dropDocument(id, docId)) ? dir.getRecord(id) : notFound(reply, 'Not on this page.');
  });

  /* Les listes de la fiche — produits, financements, programmes suivis
     ailleurs — une ligne à la fois, par qui peut modifier la page. Chaque route
     rend la fiche entière, comme le chiffre d'affaires. */
  for (const list of SHEET_LISTS) {
    const editable = async (req: FastifyRequest, id: string) => {
      const { access } = await accessTo(req, id);
      if (!canEditOrg(access)) throw new HttpError(403, 'Only an editor or an administrator can change this page.');
    };
    app.post(`/api/me/organisations/:id/${list}`, async (req, reply) => {
      const { id } = req.params as { id: string };
      await editable(req, id);
      await dir.addSheetItem(list, id, parse(sheetListInput[list], req.body));
      reply.code(201);
      return dir.getRecord(id);
    });
    app.patch(`/api/me/organisations/:id/${list}/:itemId`, async (req, reply) => {
      const { id, itemId } = req.params as { id: string; itemId: string };
      await editable(req, id);
      const done = await dir.changeSheetItem(list, id, itemId, parse(sheetListInput[list].partial(), req.body));
      return done ? dir.getRecord(id) : notFound(reply, 'Not on this page.');
    });
    app.delete(`/api/me/organisations/:id/${list}/:itemId`, async (req, reply) => {
      const { id, itemId } = req.params as { id: string; itemId: string };
      await editable(req, id);
      return (await dir.dropSheetItem(list, id, itemId)) ? dir.getRecord(id) : notFound(reply, 'Not on this page.');
    });
  }

  /** Un exercice du chiffre d'affaires, par qui peut modifier la page. */
  app.put('/api/me/organisations/:id/revenues/:year', async (req, reply) => {
    const { id, year } = req.params as { id: string; year: string };
    const { access } = await accessTo(req, id);
    if (!canEditOrg(access)) {
      throw new HttpError(403, 'Only an editor or an administrator can change this page.');
    }
    const y = Number(year);
    if (!Number.isInteger(y) || y < 1900 || y > 2100) return notFound(reply, 'No such year.');
    await dir.putRevenue(id, y, parse(revenueInput, req.body));
    return dir.getRecord(id);
  });

  /* ---- The team on an organisation page ---- */

  app.get('/api/me/organisations/:id/team', async (req) => {
    const { id } = req.params as { id: string };
    await accessTo(req, id);
    // Anybody on the page may read who else is on it. Changing it is another matter.
    return dir.teamOf(id);
  });

  const requireAdmin = async (req: FastifyRequest, orgId: string) => {
    const { account, access } = await accessTo(req, orgId);
    if (!canManageTeam(access)) throw new HttpError(403, 'Only an administrator can manage the team.');
    return account;
  };

  /**
   * Adding somebody to the page. No account, no password, no mail: this writes a
   * name the jury will read. The door is a separate act, below.
   */
  app.post('/api/me/organisations/:id/team', async (req, reply) => {
    const { id } = req.params as { id: string };
    await requireAdmin(req, id);
    const input = parse(teamMemberInput, req.body);

    // Somebody CEED already knows joins the page instead of arriving as a twin —
    // the rule that kept the import from splitting one founder in two.
    const existing = input.emails[0] ? await dir.findByEmail('person', input.emails[0]) : null;
    const person =
      existing ??
      (await dir.createRecord({
        kind: 'person',
        name: input.name.trim(),
        emails: input.emails,
        phones: input.phones,
        places: [],
        origin: 'team',
      }));

    const affiliation = await dir.linkRecords({
      personId: person.id,
      orgId: id,
      role: input.role,
      access: input.access,
    });
    reply.code(201);
    return { affiliationId: affiliation.id, person, joined: Boolean(existing) };
  });

  app.patch('/api/me/organisations/:id/team/:affiliationId', async (req, reply) => {
    const { id, affiliationId } = req.params as { id: string; affiliationId: string };
    await requireAdmin(req, id);
    const affiliation = await dir.affiliationById(affiliationId);
    if (!affiliation || affiliation.orgId !== id) return notFound(reply, 'Not on this team.');

    const patch = parse(teamMemberPatch, req.body);
    // A page with nobody holding it can be reached by nobody, so the last
    // administrator cannot step down — they hand over first.
    if (patch.access && patch.access !== 'admin' && affiliation.access === 'admin') {
      if ((await dir.adminCountOf(id)) <= 1) {
        throw new HttpError(422, 'Name another administrator first — a page cannot be left without one.');
      }
    }
    await dir.setAffiliation(affiliationId, patch);
    return dir.teamOf(id);
  });

  app.delete('/api/me/organisations/:id/team/:affiliationId', async (req, reply) => {
    const { id, affiliationId } = req.params as { id: string; affiliationId: string };
    const account = await requireAdmin(req, id);
    const affiliation = await dir.affiliationById(affiliationId);
    if (!affiliation || affiliation.orgId !== id) return notFound(reply, 'Not on this team.');
    if (affiliation.personId === account.recordId) {
      throw new HttpError(422, 'You cannot take yourself off your own page.');
    }
    if (affiliation.access === 'admin' && (await dir.adminCountOf(id)) <= 1) {
      throw new HttpError(422, 'Name another administrator first — a page cannot be left without one.');
    }
    // The link goes; the person stays. They may hold other pages, and an account
    // they have already claimed is theirs, not the organisation's to close.
    await dir.unlinkRecords(affiliationId);
    reply.code(204);
  });

  /**
   * Opening a way in for a teammate. Recorded rather than delivered, like every
   * other invitation here: the password comes back once, for the founder to pass
   * on, until mail routing exists to carry it.
   */
  app.post('/api/me/organisations/:id/team/:affiliationId/invite', async (req, reply) => {
    const { id, affiliationId } = req.params as { id: string; affiliationId: string };
    await requireAdmin(req, id);
    const affiliation = await dir.affiliationById(affiliationId);
    if (!affiliation || affiliation.orgId !== id) return notFound(reply, 'Not on this team.');

    const person = await dir.getRecord(affiliation.personId);
    if (!person) return notFound(reply, 'Not on this team.');
    const email = person.email.trim();
    if (!email) {
      throw new HttpError(422, `${person.name} has no email address — add one before inviting them.`, {
        email: 'An invitation needs somewhere to go.',
      });
    }

    const existing = await accountOfRecord(person.id);
    // A password its owner chose is never overwritten from outside.
    if (existing && existing.state === 'claimed') {
      throw new HttpError(422, `${person.name} already signed in and chose their own password.`);
    }
    if (await findAccount(email)) {
      const held = existing?.email === email.toLowerCase();
      if (!held) throw new HttpError(422, 'Another account already uses this email address.');
    }

    const password = suggestPassword();
    if (existing) await reissueProvisionalPassword(existing.id, password);
    else await createAccount({ email, password, recordId: person.id, mustChangePassword: true });

    const account = (await accountOfRecord(person.id))!;
    await markInvited(account.id);
    reply.code(201);
    return { email, password } satisfies TeamInvite;
  });
}
