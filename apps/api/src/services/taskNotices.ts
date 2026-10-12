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

  const own = (record.email ?? '').trim();
  if (record.kind === 'person') {
    return own
      ? { email: own, toName: record.name, accountFor: record.id, blocked: '' }
      : { email: '', toName: record.name, accountFor: null, blocked: 'no_email' };
  }

  if (own) return { email: own, toName: record.name, accountFor: null, blocked: '' };

  /* Qui tient la page d'abord — `teamOf` les rend déjà dans cet ordre. */
  const team = await dir.teamOf(record.id);
  const holder = team.find((m) => (m.person.email ?? '').trim());
  return holder
    ? {
        email: holder.person.email!.trim(),
        /* Son nom, pas celui de la société : la lettre arrive chez une
           personne, et « Bonjour Rafid Tech » dans sa boîte est une lettre
           qui ne lui est pas adressée. */
        toName: holder.person.name,
        accountFor: holder.person.id,
        blocked: '',
      }
    : { email: '', toName: record.name, accountFor: null, blocked: 'no_email' };
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
export async function tellOwner(taskId: string): Promise<Told> {
  const letter = await houseLetter('task_given');
  if (!letter.enabled) return { told: false, why: 'off' };

  const task = await getTask(taskId);
  if (!task) return { told: false, why: 'gone' };
  if (task.toldAt) return { told: false, why: 'already' };

  const hearer = await whoHears(task.ownerId);
  if (hearer.blocked) return { told: false, why: hearer.blocked };

  const claimed = await all<{ id: string }>(
    'update tasks set told_at = now() where id = $1 and told_at is null returning id',
    [taskId],
  );
  if (!claimed.length) return { told: false, why: 'already' };

  const values = await givenValues(task, hearer, letter.body);
  const id = await post({
    kind: 'task_given',
    to: hearer.email,
    toName: hearer.toName,
    subject: fillTemplate(letter.subject, values),
    body: fillTemplate(letter.body, values),
    recordId: task.ownerId,
  });

  if (!id) {
    await all('update tasks set told_at = null where id = $1', [taskId]);
    return { told: false, why: 'not_posted' };
  }
  return { told: true, letterId: id };
}

async function givenValues(task: Task, hearer: Hearer, template: string): Promise<Record<string, string>> {
  return {
    prenom: firstNameOf(hearer.toName),
    nom: hearer.toName,
    tache: task.title,
    detail: task.detail,
    echeance: task.dueOn ? `À faire pour le ${longDate(task.dueOn)}.` : '',
    apropos: task.aboutName ? `À propos de : ${task.aboutName}.` : '',
    donnepar: task.createdByName,
    acces: await accessIfAsked(template, hearer.accountFor),
    lien: await linkFor(hearer.accountFor),
  };
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
const LATE_AND_DUE_A_LETTER = `
      state = 'open'
  and due_on is not null
  and due_on < current_date
  and (late_letter_at is null or late_letter_at < now() - interval '${LATE_AGAIN_AFTER_DAYS} days')`;

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
    `select t.owner_id as "ownerId" from tasks t
       join records o on o.id = t.owner_id and o.deleted_at is null
      where ${LATE_AND_DUE_A_LETTER}
      group by t.owner_id`,
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

    const claimed = await all<LateRow>(
      `update tasks set late_letter_at = now()
        where owner_id = $1 and ${LATE_AND_DUE_A_LETTER}
        returning id, title, due_on::text as "dueOn"`,
      [ownerId],
    );
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
      await all(`update tasks set late_letter_at = null where id = any($1::text[])`, [claimed.map((t) => t.id)]);
      skipped += 1;
    }
  }
  return { sent, skipped };
}
