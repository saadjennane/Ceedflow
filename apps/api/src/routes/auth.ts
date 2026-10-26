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
  reportInput,
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
import { meetingFor, meetingsFor, saveReport } from '../services/oneToOne.js';
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

/**
 * La lettre à une adresse que CEED connaissait : le mot de passe qui prouve
 * qu'on la tient, provisoire, remplacé à la première connexion.
 */
async function mailKnownAddress(email: string, name: string, recordId: string, password: string) {
  const origin = await appLink();
  const login = origin ? origin.replace(/\/me\?tab=Programs$/, '/login') : '';
  await post({
    kind: 'account_known',
    to: email,
    toName: name,
    recordId,
    subject: 'Votre compte CEED — Your CEED account',
    body: [
      name ? `${name},` : 'Bonjour,',
      '',
      'Vous venez de créer un compte avec une adresse que CEED connaissait déjà. Pour être sûrs que c’est bien la vôtre, voici votre mot de passe — vous en choisirez un à vous en vous connectant :',
      '',
      `    ${email}`,
      `    ${password}`,
      '',
      ...(login ? [`    ${login}`, ''] : []),
      'Vous retrouverez votre fiche, vos organisations et vos programmes. Si vous n’avez rien demandé, ignorez ce message.',
      '',
      '—',
      '',
      'You just created an account with an address CEED already knew. To make sure it is yours, here is your password — you will choose your own when you sign in. If you did not ask for this, ignore this message.',
    ].join('\n'),
  });
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

    /* Quelqu'un que CEED connaît déjà, par son adresse : un juré, une
       fondatrice importée. Sa fiche porte ses panels, ses organisations, ses
       rendez-vous — la lui rendre sur la seule foi d'un formulaire, c'était
       la rendre à quiconque tape son adresse. Le mot de passe part donc à
       cette adresse : qui le reçoit la possède, et retrouve tout en se
       connectant. Jamais par le nom : cinq fondateurs s'appellent Ali. */
    const known = await dir.findByEmail('person', input.email);
    if (known) {
      if (await accountOfRecord(known.id)) {
        throw new HttpError(422, 'This person already has an account.', {
          email: 'Already has an account — sign in, or use “Forgot password”.',
        });
      }
      const password = suggestPassword();
      await createAccount({ email: input.email, password, recordId: known.id, mustChangePassword: true });
      await mailKnownAddress(input.email, known.name, known.id, password);
      reply.code(202);
      return { mailed: true, email: input.email };
    }

    const name = fullName(input.firstName, input.lastName);
    const record = await dir.createRecord({
      kind: 'person',
      name,
      firstName: input.firstName,
      lastName: input.lastName,
      emails: [input.email],
      places: [],
      origin: 'signup',
    });

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

    const { org, joined, pending } = await dir.openOrganisation(account.recordId, input);
    if (pending) await tellAdminsOfRequest(org.id, account.recordId);
    reply.code(201);
    /* Une demande ne montre de l'organisation que son nom : la page entière
       attend qu'on ait dit oui. */
    return pending ? { organisation: { id: org.id, name: org.name }, joined, pending } : { organisation: org, joined, pending };
  });

  /** Ce que la personne attend encore : ses demandes pour rejoindre une organisation. */
  app.get('/api/me/requests', async (req) => {
    const account = await require(req);
    return (await dir.requestsBy(account.recordId)).map(({ id, orgId, orgName, createdAt }) => ({ id, orgId, orgName, createdAt }));
  });

  /** Retirer sa propre demande. */
  app.delete('/api/me/requests/:requestId', async (req, reply) => {
    const account = await require(req);
    const { requestId } = req.params as { requestId: string };
    const request = await dir.requestById(requestId);
    if (!request || request.personId !== account.recordId) return notFound(reply, 'No such request.');
    await dir.declineRequest(requestId);
    reply.code(204);
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

  /* ---- Les One to One de l'interlocuteur ---- */

  /** Mes rendez-vous : ceux où je suis l'interlocuteur, dans les briques ouvertes ou fermées. */
  app.get('/api/me/meetings', async (req) => {
    const account = await require(req);
    return meetingsFor(account.recordId);
  });

  app.get('/api/me/meetings/:id', async (req, reply) => {
    const account = await require(req);
    const { id } = req.params as { id: string };
    return (await meetingFor(account.recordId, id)) ?? notFound(reply, 'Meeting not found.');
  });

  /**
   * Écrire mon compte rendu. L'auteur vient de la session, jamais de la
   * requête ; la brique doit être ouverte — fermée, on relit sans réécrire.
   */
  app.put('/api/me/meetings/:id/report', async (req, reply) => {
    const account = await require(req);
    const { id } = req.params as { id: string };
    const meeting = (await meetingsFor(account.recordId)).find((m) => m.id === id);
    if (!meeting) return notFound(reply, 'Meeting not found.');
    if (meeting.state !== 'open') {
      throw new HttpError(403, 'These reports are closed. Ask the CEED team if something has to change.');
    }
    const { answers, submit } = parse(reportInput, req.body);
    const who = await dir.getRecord(account.recordId);
    return saveReport(id, answers, submit, { id: account.recordId, name: who?.name ?? '' });
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
    await repo.claimUploads(candidateId, { [input.itemId]: input.value }, account.recordId);
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
    /* Une note est sur la grille, et dans son échelle : une note de mille sur
       dix, envoyée à la main, pèserait plus que tout le reste du jury. */
    if (panel.evaluation.method === 'verdict') {
      if (input.verdict && !panel.evaluation.outcomes.some((o) => o.id === input.verdict)) {
        throw new HttpError(422, 'That verdict is not one of this panel’s.');
      }
    } else {
      const outOf = panel.evaluation.markedOutOf;
      const criteria = new Set(panel.evaluation.leaves.map((l) => l.id));
      for (const [criterion, mark] of Object.entries(input.marks)) {
        if (!criteria.has(criterion)) throw new HttpError(422, 'A mark was given for a criterion this grid does not have.');
        if (!Number.isFinite(mark) || mark < 0 || mark > outOf) {
          throw new HttpError(422, `Every mark is between 0 and ${outOf}.`);
        }
      }
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

  /**
   * Un fichier qu'on met sur la page — logo, document, image d'un produit —
   * doit être le sien ou déjà celui de l'organisation. Connaître l'identifiant
   * du fichier d'une autre startup ne suffit pas à le faire sien.
   */
  const placeable = async (by: string, orgId: string, uploadId: unknown) => {
    if (typeof uploadId !== 'string' || !uploadId) return;
    if (!(await repo.mayPlaceUpload(uploadId, by, orgId))) {
      throw new HttpError(422, 'That file did not arrive. Send it again.', { uploadId: 'Missing file.' });
    }
  };

  app.patch('/api/me/organisations/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { account, access } = await accessTo(req, id);
    if (!canEditOrg(access)) {
      throw new HttpError(403, 'Only an editor or an administrator can change this page.');
    }
    const patch = parse(myOrgInput.omit({ myRole: true }).partial(), req.body);
    await placeable(account.recordId, id, patch.logoUploadId);
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
    await placeable(account.recordId, id, (req.body as { uploadId?: unknown } | null)?.uploadId);
    const who = await dir.getRecord(account.recordId);
    await addOrgDocument(id, req.body, who?.name ?? '');
    reply.code(201);
    return dir.getRecord(id);
  });
  app.patch('/api/me/organisations/:id/documents/:docId', async (req, reply) => {
    const { id, docId } = req.params as { id: string; docId: string };
    const account = await canEdit(req, id);
    await placeable(account.recordId, id, (req.body as { uploadId?: unknown } | null)?.uploadId);
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
      const { account, access } = await accessTo(req, id);
      if (!canEditOrg(access)) throw new HttpError(403, 'Only an editor or an administrator can change this page.');
      return account;
    };
    app.post(`/api/me/organisations/:id/${list}`, async (req, reply) => {
      const { id } = req.params as { id: string };
      const account = await editable(req, id);
      const item = parse(sheetListInput[list], req.body);
      await placeable(account.recordId, id, (item as { imageUploadId?: unknown }).imageUploadId);
      await dir.addSheetItem(list, id, item);
      reply.code(201);
      return dir.getRecord(id);
    });
    app.patch(`/api/me/organisations/:id/${list}/:itemId`, async (req, reply) => {
      const { id, itemId } = req.params as { id: string; itemId: string };
      const account = await editable(req, id);
      const patch = parse(sheetListInput[list].partial(), req.body);
      await placeable(account.recordId, id, (patch as { imageUploadId?: unknown }).imageUploadId);
      const done = await dir.changeSheetItem(list, id, itemId, patch);
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

  /* ---- Ceux qui demandent à rejoindre la page ---- */

  app.get('/api/me/organisations/:id/requests', async (req) => {
    const { id } = req.params as { id: string };
    await requireAdmin(req, id);
    return dir.requestsFor(id);
  });

  app.post('/api/me/organisations/:id/requests/:requestId/accept', async (req, reply) => {
    const { id, requestId } = req.params as { id: string; requestId: string };
    await requireAdmin(req, id);
    const request = await dir.requestById(requestId);
    if (!request || request.orgId !== id) return notFound(reply, 'No such request.');
    await dir.acceptRequest(requestId);
    return dir.teamOf(id);
  });

  app.delete('/api/me/organisations/:id/requests/:requestId', async (req, reply) => {
    const { id, requestId } = req.params as { id: string; requestId: string };
    await requireAdmin(req, id);
    const request = await dir.requestById(requestId);
    if (!request || request.orgId !== id) return notFound(reply, 'No such request.');
    await dir.declineRequest(requestId);
    reply.code(204);
  });

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
   * Ouvrir un compte à un coéquipier.
   *
   * Le mot de passe part par mail, à son adresse, et ne revient jamais à
   * l'écran : l'adresse d'une équipe se tape librement, et rendre le mot de
   * passe à qui l'a tapée, c'était lui donner le compte de n'importe qui — un
   * juré, un membre de CEED — pourvu qu'il ne se soit pas encore connecté.
   * Pour la même raison, un compte qui existe déjà n'est jamais touché d'ici :
   * son titulaire se connecte, ou passe par « mot de passe oublié ».
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
    if ((await accountOfRecord(person.id)) || (await findAccount(email))) {
      throw new HttpError(
        422,
        `${person.name} already has an account. They sign in with it — or use “Forgot password” on the sign-in page.`,
      );
    }

    const password = suggestPassword();
    await createAccount({ email, password, recordId: person.id, mustChangePassword: true });
    const account = (await accountOfRecord(person.id))!;
    await markInvited(account.id);
    const org = await dir.getRecord(id);
    await mailTeamInvite(email, person.name, person.id, org?.name ?? '', password);
    reply.code(201);
    return { email } satisfies TeamInvite;
  });
}

/** Le mot de passe d'un coéquipier, à son adresse et à elle seule. */
async function mailTeamInvite(email: string, name: string, recordId: string, orgName: string, password: string) {
  const origin = await appLink();
  const login = origin ? origin.replace(/\/me\?tab=Programs$/, '/login') : '';
  await post({
    kind: 'team_invite',
    to: email,
    toName: name,
    recordId,
    subject: `Votre compte CEED${orgName ? ` — ${orgName}` : ''}`,
    body: [
      name ? `${name},` : 'Bonjour,',
      '',
      `${orgName ? `L’équipe de ${orgName} vous` : 'On vous'} a ouvert un compte sur l’espace CEED. Voici votre mot de passe — vous en choisirez un à vous en vous connectant :`,
      '',
      `    ${email}`,
      `    ${password}`,
      '',
      ...(login ? [`    ${login}`, ''] : []),
      'Si vous ne vous y attendiez pas, ignorez ce message : rien ne se passe tant que personne ne se connecte.',
      '',
      '—',
      '',
      `${orgName ? `The ${orgName} team` : 'Someone'} opened a CEED account for you. Sign in with the password above; you will choose your own.`,
    ].join('\n'),
  });
}

/**
 * Prévenir les administrateurs d'une organisation qu'on demande à la rejoindre.
 * Une organisation sans administrateur joignable attend CEED, qui voit la
 * demande sur sa fiche.
 */
export async function tellAdminsOfRequest(orgId: string, personId: string) {
  const [org, person, team] = await Promise.all([dir.getRecord(orgId), dir.getRecord(personId), dir.teamOf(orgId)]);
  if (!org || !person) return;
  const origin = await appLink();
  const space = origin ? origin.replace(/\?tab=Programs$/, '?tab=Profile') : '';
  for (const member of team) {
    const admin = member.person;
    if (member.access !== 'admin' || !admin.email) continue;
    await post({
      kind: 'org_request',
      to: admin.email,
      toName: admin.name,
      recordId: admin.id,
      subject: `${person.name} demande à rejoindre ${org.name}`,
      body: [
        `${admin.name},`,
        '',
        `${person.name}${person.email ? ` (${person.email})` : ''} demande à rejoindre la page de ${org.name} sur CEED. Tant que vous n’avez pas accepté, cette personne ne voit rien de ce que la page garde pour l’équipe.`,
        '',
        ...(space ? [`Accepter ou refuser : ${space}`, ''] : []),
        '—',
        '',
        `${person.name} asked to join ${org.name} on CEED. Until you accept, they see nothing the page keeps for its team.`,
      ].join('\n'),
    });
  }
}
