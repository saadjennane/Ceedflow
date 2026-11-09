/**
 * Dire à quelqu'un qu'on attend quelque chose de lui.
 *
 * Une tâche posée dans l'application est vue par qui ouvre l'application.
 * L'équipe CEED l'ouvre tous les jours ; un mentor, un juré, une fondatrice,
 * une fois par mois — et pour eux, une tâche qu'on ne découvre qu'en se
 * connectant est une tâche qu'on découvre en retard.
 *
 * Deux lettres et pas une de plus. Celle qui annonce la tâche part à
 * l'instant où on la confie, une seule fois, et seulement si on l'a demandé.
 * Celle des retards est un récapitulatif : une personne qui en a quatre reçoit
 * une lettre, pas quatre, et pas tous les matins.
 *
 * Rien ne part par surprise : chaque non-envoi a une raison en mots, et
 * l'écran qui propose de prévenir nomme d'avance qui n'a pas d'adresse.
 */
import {
  ACCESS_DEFAULT,
  LATE_AGAIN_AFTER_DAYS,
  fillTemplate,
  howMany,
  longDate,
  type Task,
} from '@ceed/shared';
import { all, one } from '../db/client.js';
import * as dir from '../db/directory.js';
import { accessFor } from './invitations.js';
import { houseLetter } from './houseLetters.js';
import { reachFor } from './people.js';
import { post } from './mail.js';
import { publicOrigin } from './platform.js';
import { getTask } from './tasks.js';

/** L'heure à laquelle un rappel de retard part — la même que les autres. */
const SEND_HOUR_UTC = Number(process.env.SEND_HOUR_UTC ?? 7);

/**
 * À quelle adresse on écrit, et pourquoi parfois à aucune.
 *
 * Une personne a la sienne. Une société a souvent une adresse de contact, et
 * quand elle n'en a pas, c'est à qui tient sa page qu'on écrit : une tâche
 * confiée à une startup est faite par quelqu'un, et ce quelqu'un est
 * précisément celui que la page désigne.
 */
export interface Hearer {
  email: string;
  toName: string;
  /** La fiche à qui on ouvre une porte, s'il faut en ouvrir une. Jamais une
      organisation : un compte se tient par une personne. */
  accountFor: string | null;
  /** '' quand la lettre peut partir. Sinon, ce qu'on affiche tel quel. */
  blocked: string;
}

export async function whoHears(ownerId: string): Promise<Hearer> {
  const record = await dir.getRecord(ownerId);
  if (!record) return { email: '', toName: '', accountFor: null, blocked: 'gone' };

  /* La même règle que l'audience d'un sourcing, et pour la même raison : une
     société n'a presque jamais d'adresse à elle, et celle de son contact est
     liée à elle depuis le premier jour. Une seule écriture de cette règle,
     sinon deux écrans comptent deux nombres de joignables. */
  const [reach] = [...(await reachFor([{ id: record.id, kind: record.kind, name: record.name, email: record.email }])).values()];
  if (!reach?.email) return { email: '', toName: record.name, accountFor: null, blocked: 'no_email' };
  return {
    email: reach.email,
    toName: reach.toName,
    /* La fiche à qui on ouvrirait une porte : une personne, jamais une
       société — un compte se tient par quelqu'un. */
    accountFor: reach.viaId ?? (record.kind === 'person' ? record.id : null),
    blocked: '',
  };
}

/** Le prénom quand on le connaît, le nom entier sinon. */
const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? '';

/**
 * Où cette personne lit ses tâches.
 *
 * L'équipe CEED les a sur sa page à elle ; tous les autres sur la leur. Un
 * lien vers le mauvais espace est une porte fermée au nez de quelqu'un qu'on
 * vient de solliciter.
 */
async function linkFor(recordId: string | null): Promise<string> {
  const origin = await publicOrigin();
  if (!origin) return '';
  const staff = recordId
    ? await one<{ role: string | null }>('select staff_role as role from accounts where record_id = $1', [recordId])
    : null;
  return staff?.role ? `${origin}/tasks` : `${origin}/me`;
}

/**
 * Le paragraphe de première connexion, et seulement s'il est demandé.
 *
 * `accessFor` ouvre un compte et fabrique un mot de passe : l'appeler pour
 * savoir s'il servira ouvrirait des comptes au nom d'une lettre qui ne les
 * nomme pas. Le gabarit est donc lu d'abord.
 */
const accessIfAsked = async (template: string, recordId: string | null): Promise<string> =>
  template.includes('{{acces}}') && recordId ? accessFor(recordId, ACCESS_DEFAULT) : '';

/* ------------------------------------------------------------------ */
/* La lettre qui annonce une tâche                                     */
/* ------------------------------------------------------------------ */

export type Told = { told: true; letterId: string } | { told: false; why: string };

/**
 * Prévient le destinataire d'une tâche, une fois.
 *
 * La ligne est réclamée avant l'écriture — `told_at is null` dans le where —
 * pour que deux appels au même instant n'envoient pas deux fois. Et elle est
 * rendue si la lettre n'a pas pu partir : une tâche marquée annoncée sans que
 * rien ne soit parti est la seule façon de ne jamais réessayer.
 */
/** Qui entend parler d'une tâche : ses owners de l'équipe, et celui à qui elle est confiée. */
export const recipientsOf = (task: Task, except: string | null = null): string[] =>
  [...new Set([...(task.delegate ? [task.delegate.id] : []), ...task.owners.map((o) => o.id)])].filter((id) => id !== except);

/**
 * Annonce une tâche, une fois : à celui à qui elle est confiée, et aux owners
 * — sauf à qui vient de la créer, qui la connaît.
 */
export async function tellOwner(taskId: string, except: string | null = null): Promise<Told> {
  const letter = await houseLetter('task_given');
  if (!letter.enabled) return { told: false, why: 'off' };

  const task = await getTask(taskId);
  if (!task) return { told: false, why: 'gone' };
  if (task.toldAt) return { told: false, why: 'already' };

  const claimed = await all<{ id: string }>(
    'update tasks set told_at = now() where id = $1 and told_at is null returning id',
    [taskId],
  );
  if (!claimed.length) return { told: false, why: 'already' };

  let first: string | null = null;
  let why = 'no_one';
  for (const recordId of recipientsOf(task, except)) {
    const hearer = await whoHears(recordId);
    if (hearer.blocked) {
      why = hearer.blocked;
      continue;
    }
    const values = await givenValues(task, hearer, letter.body);
    const id = await post({
      kind: 'task_given',
      to: hearer.email,
      toName: hearer.toName,
      subject: fillTemplate(letter.subject, values),
      body: fillTemplate(letter.body, values),
      recordId,
    });
    if (id) first ??= id;
    else why = 'not_posted';
  }
  if (!first) {
    await all('update tasks set told_at = null where id = $1', [taskId]);
    return { told: false, why };
  }
  return { told: true, letterId: first };
}

/**
 * Prévenir une personne de l'équipe qu'une tâche l'attend : la débloquer, ou
 * la valider. Une lettre de la maison chacune, modifiable dans les réglages.
 */
export async function tellWaiting(taskId: string, kind: 'task_stuck' | 'task_to_validate', recordId: string, byName: string): Promise<boolean> {
  const letter = await houseLetter(kind);
  if (!letter.enabled) return false;
  const task = await getTask(taskId);
  if (!task) return false;
  const hearer = await whoHears(recordId);
  if (hearer.blocked) return false;
  const values = {
    prenom: firstNameOf(hearer.toName),
    tache: task.title,
    par: byName,
    raison: kind === 'task_stuck' ? task.stuckReason : task.validationNote,
    lien: `${await linkFor(recordId)}${task.id ? `?task=${task.id}` : ''}`,
  };
  return Boolean(
    await post({
      kind,
      to: hearer.email,
      toName: hearer.toName,
      subject: fillTemplate(letter.subject, values),
      body: fillTemplate(letter.body, values),
      recordId,
    }),
  );
}

async function givenValues(task: Task, hearer: Hearer, template: string): Promise<Record<string, string>> {
  return {
    prenom: firstNameOf(hearer.toName),
    nom: hearer.toName,
    tache: task.title,
    detail: task.detail,
    checklist: task.items.map((i) => `  · ${i.label}`).join('\n'),
    echeance: task.dueOn ? `À faire pour le ${longDate(task.dueOn)}.` : '',
    apropos: task.aboutName ? `À propos de : ${task.aboutName}.` : '',
    donnepar: task.createdByName,
    acces: await accessIfAsked(template, hearer.accountFor),
    lien: await linkFor(hearer.accountFor),
  };
}

/**
 * Annoncer plusieurs tâches d'un coup — celles d'une réunion : une lettre par
 * personne, qui les liste toutes. Chaque tâche est réclamée avant l'envoi, comme
 * pour une seule : deux appels qui se chevauchent n'en annoncent aucune deux fois.
 */
export async function tellOwnersAtOnce(
  taskIds: string[],
  context: { meeting: string; byName: string },
): Promise<{ told: number; notTold: number }> {
  const letter = await houseLetter('tasks_given');
  if (!letter.enabled || !taskIds.length) return { told: 0, notTold: taskIds.length };
  const tasks = (await Promise.all(taskIds.map((id) => getTask(id)))).filter((t): t is Task => Boolean(t) && !t!.toldAt);
  const byOwner = new Map<string, Task[]>();
  for (const t of tasks) for (const r of recipientsOf(t)) byOwner.set(r, [...(byOwner.get(r) ?? []), t]);

  let told = 0;
  let notTold = taskIds.length - tasks.length;
  for (const [ownerId, list] of byOwner) {
    const hearer = await whoHears(ownerId);
    if (hearer.blocked) {
      notTold += list.length;
      continue;
    }
    /* Réclamées une fois pour toutes : chacun de leurs destinataires est prévenu dans ce même passage. */
    await all('update tasks set told_at = now() where id = any($1::text[]) and told_at is null', [list.map((t) => t.id)]);
    const mine = list;
    const PRIORITY_SAID = { high: 'priorité haute', medium: '', low: 'priorité basse' } as const;
    const lines = mine
      .map((t) =>
        [`  · ${t.title}`, PRIORITY_SAID[t.priority ?? 'medium'], t.dueOn ? `pour le ${longDate(t.dueOn)}` : '']
          .filter(Boolean)
          .join(' — '),
      )
      .join('\n');
    const values = {
      prenom: firstNameOf(hearer.toName),
      nom: hearer.toName,
      taches: lines,
      combien: howMany(mine.length),
      reunion: context.meeting,
      donnepar: context.byName,
      acces: await accessIfAsked(letter.body, hearer.accountFor),
      lien: await linkFor(hearer.accountFor),
    };
    const id = await post({
      kind: 'tasks_given',
      to: hearer.email,
      toName: hearer.toName,
      subject: fillTemplate(letter.subject, values),
      body: fillTemplate(letter.body, values),
      recordId: ownerId,
    });
    if (id) told += mine.length;
    else notTold += mine.length;
  }
  return { told, notTold };
}

/* ------------------------------------------------------------------ */
/* Le récapitulatif des retards                                        */
/* ------------------------------------------------------------------ */

interface LateRow {
  id: string;
  title: string;
  dueOn: string;
}

/**
 * Ce qui est en retard et dont on n'a pas encore reparlé cette semaine.
 *
 * `due_on < current_date` et non `<=` : quelqu'un a jusqu'au soir du jour dit,
 * exactement comme à l'écran. Les deux doivent dire la même chose, sinon une
 * tâche est rouge dans une lettre et pas dans la liste.
 */
const LATE = `
      t.state in ('open', 'doing', 'stuck', 'to_validate')
  and t.due_on is not null
  and t.due_on < current_date`;

/** Les personnes qu'une tâche concerne : ses owners, et celui à qui elle est confiée. */
const RECIPIENTS = `(select x.record_id from task_owners x where x.task_id = t.id
                     union select t.delegate_id where t.delegate_id is not null)`;

/**
 * Envoie un récapitulatif par personne en retard.
 *
 * Les lignes sont réclamées par destinataire, dans le `update ... returning`
 * qui les choisit : deux ticks qui se chevauchent, ou un redémarrage au
 * mauvais moment, ne peuvent pas faire partir deux fois la même liste.
 */
export async function sendLateDigests(now = new Date()): Promise<{ sent: number; skipped: number }> {
  /* Avant l'heure, rien. Une tâche devient en retard au premier instant du
     jour : sans cette garde, le rappel part à une heure du matin. */
  if (now.getUTCHours() < SEND_HOUR_UTC) return { sent: 0, skipped: 0 };

  const letter = await houseLetter('task_late');
  if (!letter.enabled) return { sent: 0, skipped: 0 };

  const owners = await all<{ ownerId: string }>(
    `select distinct r.id as "ownerId" from tasks t
       join records r on r.id in ${RECIPIENTS} and r.deleted_at is null
      where ${LATE}
        and not exists (select 1 from task_late_letters l where l.task_id = t.id and l.record_id = r.id
                          and l.sent_at > now() - interval '${LATE_AGAIN_AFTER_DAYS} days')`,
  );

  let sent = 0;
  let skipped = 0;
  for (const { ownerId } of owners) {
    /* L'adresse d'abord : sans elle on ne réclame rien, pour que le rappel
       parte le jour où quelqu'un lui en saisit une. */
    const hearer = await whoHears(ownerId);
    if (hearer.blocked) {
      skipped += 1;
      continue;
    }

    /* Réclamées pour cette personne seulement : une tâche partagée prévient chacun. */
    const due = await all<LateRow>(
      `select t.id, t.title, t.due_on::text as "dueOn" from tasks t
        where ${LATE} and $1 in ${RECIPIENTS}`,
      [ownerId],
    );
    const claimedIds = (
      await all<{ taskId: string }>(
        `insert into task_late_letters (task_id, record_id) select unnest($1::text[]), $2
         on conflict (task_id, record_id) do update set sent_at = now()
           where task_late_letters.sent_at < now() - interval '${LATE_AGAIN_AFTER_DAYS} days'
         returning task_id as "taskId"`,
        [due.map((t) => t.id), ownerId],
      )
    ).map((r) => r.taskId);
    const claimed = due.filter((t) => claimedIds.includes(t.id));
    if (!claimed.length) continue;

    const lines = claimed
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
      .map((t) => `  · ${t.title} — pour le ${longDate(t.dueOn)}`)
      .join('\n');
    const values = {
      prenom: firstNameOf(hearer.toName),
      nom: hearer.toName,
      taches: lines,
      combien: howMany(claimed.length),
      acces: await accessIfAsked(letter.body, hearer.accountFor),
      lien: await linkFor(hearer.accountFor),
    };

    const id = await post({
      kind: 'task_late',
      to: hearer.email,
      toName: hearer.toName,
      subject: fillTemplate(letter.subject, values),
      body: fillTemplate(letter.body, values),
      recordId: ownerId,
    });

    if (id) {
      sent += 1;
    } else {
      /* Rendues, pour que le prochain tick réessaie : une tâche tamponnée sans
         lettre partie est une tâche dont on ne reparlera pas avant une semaine. */
      await all(`delete from task_late_letters where record_id = $1 and task_id = any($2::text[])`, [ownerId, claimed.map((t) => t.id)]);
      skipped += 1;
    }
  }
  return { sent, skipped };
}
