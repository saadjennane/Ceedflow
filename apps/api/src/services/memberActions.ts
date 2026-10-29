/**
 * Ce qu'un membre a à faire, et ce qui l'attend — tous programmes et rôles
 * confondus.
 *
 * Nothing here is stored. Every line is read off the object it is about — a
 * task, a deliverables list, a jury panel, a meeting, a sitting — so that
 * whichever screen shows it, it is the same thing with the same state: send
 * the report from the Home and it is gone from the Home because the meeting
 * now has a report, not because a copy was ticked.
 *
 * The words are the screen's: each line says what it is and carries its
 * numbers, and the member space writes it in French or English.
 */
import {
  canEditOrg,
  itemComplete,
  profileMissing,
  profileOf,
  type ActionStatus,
  type MemberAction,
  type MemberActivity,
  meetingWith,
} from '@ceed/shared';
import * as dir from '../db/directory.js';
import * as repo from '../db/repo.js';
import { programsFor } from '../routes/auth.js';
import { agendaFor } from './agenda.js';
import { deliverablesFor } from './deliverables.js';
import { meetingsFor, prepsDueFor } from './oneToOne.js';
import { reviewsFor } from './reviews.js';
import { listTasks } from './tasks.js';

const today = () => new Date().toISOString().slice(0, 10);

/** Late once its day has gone by; started once something has been done. */
const statusOf = (dueOn: string | null, started: boolean): ActionStatus =>
  dueOn && dueOn.slice(0, 10) < today() ? 'late' : started ? 'in_progress' : 'pending';

const RANK: Record<ActionStatus, number> = { late: 0, in_progress: 1, pending: 2 };

export async function memberActions(recordId: string): Promise<{ actions: MemberAction[]; upcoming: MemberActivity[] }> {
  const actions: MemberAction[] = [];
  const upcoming: MemberActivity[] = [];
  const now = today();

  /* ---- Tasks CEED gave them, or their organisations ---- */
  const owners = [recordId, ...(await dir.orgIdsOf(recordId))];
  for (const task of await listTasks({ ownerIds: owners, open: true })) {
    actions.push({
      id: `task:${task.id}`,
      kind: 'task',
      role: 'member',
      status: statusOf(task.dueOn, task.items.some((i) => i.done) || task.state === 'doing'),
      dueOn: task.dueOn,
      programName: null,
      editionId: null,
      href: '',
      label: task.title,
      left: task.items.length ? task.items.filter((i) => !i.done).length : undefined,
      of: task.items.length || undefined,
      task,
    });
  }

  /* ---- Their organisations' pages, when one is still incomplete ---- */
  const me = await dir.getRecord(recordId);
  if (me) {
    for (const link of await dir.linksOf(me)) {
      if (link.record.kind !== 'org' || !canEditOrg(link.affiliation.access)) continue;
      const profile = profileOf(link.record);
      const missing = profileMissing(profile);
      if (!missing.length) continue;
      actions.push({
        id: `profile:${link.record.id}`,
        kind: 'profile',
        role: 'startup',
        status: 'pending',
        dueOn: null,
        programName: null,
        editionId: null,
        href: '/me?tab=Profile',
        label: link.record.name,
        orgName: link.record.name,
        left: missing.length,
      });
    }
  }

  /* ---- Their candidacies: what is owed, and what asks for an answer ---- */
  for (const program of await programsFor(recordId)) {
    for (const mine of program.mine) {
      const candidate = await repo.getCandidate(mine.id);
      if (!candidate || candidate.status === 'Withdrawn') continue;
      const where = { programName: `${program.programName} — ${program.editionName}`, editionId: program.editionId };

      for (const owed of await deliverablesFor(program.editionId, candidate)) {
        if (!owed.open) continue;
        const required = owed.config.items.filter((i) => i.required);
        const valueOf = (id: string) => owed.returns.find((r) => r.itemId === id)?.value;
        const sent = required.filter((i) => itemComplete(i, valueOf(i.id))).length;
        const back = owed.returns.some((r) => r.state === 'rejected');
        if (sent >= required.length && !back) continue;
        actions.push({
          id: `deliverable:${owed.block.id}:${candidate.id}`,
          kind: 'deliverable',
          role: 'startup',
          status: statusOf(owed.config.closesAt ?? null, sent > 0),
          dueOn: owed.config.closesAt ?? null,
          ...where,
          href: `/me?tab=Programs&prog=${program.editionId}`,
          label: owed.block.name,
          orgName: candidate.orgName,
          left: required.length - sent,
          of: required.length,
          back,
        });
      }

      /* La préparation d'une séance à venir, quand la brique en demande une. */
      for (const { meeting, started } of await prepsDueFor(candidate.id)) {
        actions.push({
          id: `prep:${meeting.id}`,
          kind: 'prepare',
          role: 'startup',
          status: statusOf(meeting.heldOn, started),
          dueOn: meeting.heldOn,
          ...where,
          href: `/prepare/${meeting.id}`,
          label: meetingWith(meeting),
          orgName: candidate.orgName,
        });
      }

      /* Ce qui demande une réponse : choisir une heure, ou confirmer celle
         proposée — au comité comme en One to One. Le reste du calendrier va
         dans « à venir ». */
      for (const entry of await agendaFor(candidate.id)) {
        if (entry.on && entry.on >= now) {
          upcoming.push({
            id: `${entry.kind}:${candidate.id}:${entry.blockName}:${entry.on}:${entry.startsAt ?? ''}`,
            kind: entry.kind,
            role: 'startup',
            on: entry.on,
            startsAt: entry.startsAt,
            endsAt: entry.endsAt,
            location: entry.location,
            ...where,
            label: entry.kind === 'one_to_one' ? (entry.with ?? entry.name) : entry.name,
            href: entry.link ?? null,
          });
        }
        if (!entry.link || !entry.answer) continue;
        actions.push({
          id: `answer:${entry.link}`,
          kind: entry.kind === 'committee' ? 'answer_committee' : 'answer_meeting',
          role: 'startup',
          status: statusOf(entry.answerBy ?? null, false),
          dueOn: entry.answerBy ?? null,
          ...where,
          href: entry.link,
          label: entry.kind === 'one_to_one' ? (entry.with ?? '') : entry.blockName,
          orgName: candidate.orgName,
          answer: entry.answer,
        });
      }
    }
  }

  /* ---- The panels they sit on ---- */
  for (const panel of await reviewsFor(recordId)) {
    const where = { programName: `${panel.programName} — ${panel.editionName}`, editionId: panel.editionId };
    if (panel.heldOn && panel.heldOn >= now) {
      upcoming.push({
        id: `jury:${panel.sessionId}`,
        kind: 'jury_sitting',
        role: 'jury',
        on: panel.heldOn,
        startsAt: null,
        endsAt: null,
        location: '',
        ...where,
        label: panel.sessionName,
        href: `/review/${panel.sessionId}`,
      });
    }
    if (panel.state !== 'open' || !panel.evaluation) continue;
    const waiting = panel.items.filter((i) => !i.mine?.submittedAt);
    if (!waiting.length) continue;
    actions.push({
      id: `review:${panel.sessionId}`,
      kind: 'review',
      role: 'jury',
      status: statusOf(panel.closesAt, waiting.some((i) => i.mine) || waiting.length < panel.items.length),
      dueOn: panel.closesAt,
      ...where,
      href: `/review/${panel.sessionId}`,
      label: panel.sessionName,
      left: waiting.length,
      of: panel.items.length,
    });
  }

  /* ---- The meetings they hold ---- */
  for (const meeting of await meetingsFor(recordId)) {
    const where = { programName: `${meeting.programName} — ${meeting.editionName}`, editionId: null };
    if (meeting.status === 'cancelled' || meeting.status === 'no_show') continue;
    const past = meeting.status === 'held' || (meeting.heldOn !== null && meeting.heldOn < now);
    if (!past && meeting.heldOn) {
      upcoming.push({
        id: `meeting:${meeting.id}`,
        kind: 'one_to_one',
        role: 'mentor',
        on: meeting.heldOn,
        startsAt: meeting.startTime,
        endsAt: null,
        location: meeting.location,
        ...where,
        label: meeting.orgName,
        href: `/meeting/${meeting.id}`,
      });
    }
    /* Le compte rendu est dû une fois le rendez-vous passé, tant que la
       brique est ouverte et qu'il n'est pas parti. */
    if (!past || meeting.reportSubmittedAt || meeting.state !== 'open') continue;
    actions.push({
      id: `report:${meeting.id}`,
      kind: 'report',
      role: 'mentor',
      status: Object.keys(meeting.report).length ? 'in_progress' : 'pending',
      dueOn: null,
      ...where,
      href: `/meeting/${meeting.id}`,
      label: meeting.orgName,
    });
  }

  /* Le plus pressé d'abord : en retard, puis commencé, puis le reste — et dans
     chacun, la date la plus proche. */
  actions.sort(
    (a, b) => RANK[a.status] - RANK[b.status] || (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999'),
  );
  upcoming.sort((a, b) => `${a.on ?? '9999'} ${a.startsAt ?? ''}`.localeCompare(`${b.on ?? '9999'} ${b.startsAt ?? ''}`));
  return { actions, upcoming };
}
