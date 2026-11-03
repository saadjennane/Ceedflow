/**
 * Ce que l'équipe CEED veut savoir d'une organisation en l'ouvrant.
 *
 * Where it stands with us — each candidacy, its status and its phase, a link to
 * the programme where the details live — what is stuck, what it needs, and its
 * figures. Nothing is stored: every line is read off the objects it is about.
 */
import { NEEDS, profileDone, profileOf, type MemberAction } from '@ceed/shared';
import { all } from '../db/client.js';
import * as dir from '../db/directory.js';
import * as repo from '../db/repo.js';
import { phasesOf } from './journey.js';
import { kpisOf } from './kpis.js';
import { candidacyActions } from './memberActions.js';
import { listTasks } from './tasks.js';

export interface OrgOverview {
  candidacies: {
    candidateId: string;
    programName: string;
    editionName: string;
    editionId: string;
    trackId: string;
    status: string;
    phase: string | null;
    colour: string;
    /** The edition's own page, on its startups, the candidacy open. */
    href: string;
  }[];
  /** What is asked of it right now — the same lines as its own Home — and where CEED follows each. */
  asked: (MemberAction & { workHref: string | null })[];
  alerts: { kind: string; label: string; detail: string; href: string | null; tone: 'stop' | 'warn' }[];
  needs: { need: string; label: string; detail: string }[];
  figures: { key: string; label: string; type: string; currency: string; points: { period: string; value: unknown }[] }[];
  profile: number;
}

const today = () => new Date().toISOString().slice(0, 10);

export async function orgOverview(orgId: string): Promise<OrgOverview | null> {
  const record = await dir.getRecord(orgId);
  if (!record || record.kind !== 'org') return null;
  const now = today();
  const candidacies: OrgOverview['candidacies'] = [];
  const alerts: OrgOverview['alerts'] = [];
  const asked: OrgOverview['asked'] = [];

  const mine = await all<{ id: string; editionId: string }>(
    `select c.id, c.edition_id as "editionId" from candidates c
       join editions e on e.id = c.edition_id and e.deleted_at is null
      where c.org_id = $1 and c.deleted_at is null order by c.submitted_at desc nulls last`,
    [orgId],
  );
  for (const { id } of mine) {
    const c = await repo.getCandidate(id);
    if (!c) continue;
    const detail = await repo.getEditionDetail(c.editionId);
    const track = detail?.tracks.find((t) => t.id === c.trackId);
    if (!detail || !track) continue;
    const phase = (await phasesOf(track, c)).find((p) => p.state === 'current')?.name ?? null;
    const href = `/editions/${c.editionId}?tab=startups&track=${c.trackId}&candidate=${c.id}`;
    candidacies.push({
      candidateId: c.id, programName: detail.program.name, editionName: detail.name, editionId: c.editionId,
      trackId: c.trackId, status: c.status, phase, colour: detail.program.colour ?? '#2F5BFF', href,
    });
    if (c.status === 'Withdrawn' || detail.status === 'Completed') continue;
    const where = `${detail.program.name} — ${detail.name}`;

    /* Ce qui lui est demandé : les lignes de sa propre Home, sans copie. */
    const got = await candidacyActions(c, { programName: where, editionId: c.editionId }, now);
    const work = (a: MemberAction): string | null => {
      const base = `/editions/${c.editionId}?track=${c.trackId}`;
      if (a.kind === 'deliverable') return `${base}&tab=deliverables&block=${a.id.split(':')[1]}`;
      if (a.kind === 'prepare' || a.kind === 'answer_meeting') return `${base}&tab=one-to-one`;
      if (a.kind === 'answer_committee') return `${base}&tab=committees`;
      if (a.kind === 'kpi') return `/editions/${c.editionId}?tab=reports`;
      return null;
    };
    asked.push(...got.actions.map((a) => ({ ...a, workHref: work(a) })));

    /* Ce qui ne tient pas à elle : le compte rendu d'un mentor qui tarde. */
    const late = await all<{ reports: number }>(
      `select count(*)::int as reports from one_to_one_meetings
        where candidate_id = $1 and status = 'held' and report_submitted_at is null and held_on < current_date - 2`,
      [c.id],
    );
    if (late[0]!.reports) {
      alerts.push({
        kind: 'one_to_one',
        label: `${late[0]!.reports} compte${late[0]!.reports > 1 ? 's' : ''} rendu${late[0]!.reports > 1 ? 's' : ''} de mentor en attente`,
        detail: where,
        href: `/editions/${c.editionId}?tab=one-to-one&track=${c.trackId}`,
        tone: 'warn',
      });
    }
  }

  /* Les tâches que CEED lui a données, encore ouvertes. */
  for (const task of await listTasks({ ownerIds: [orgId], open: true })) {
    asked.push({
      id: `task:${task.id}`, kind: 'task', role: 'member', dueOn: task.dueOn, programName: null, editionId: null, href: '',
      label: task.title, status: task.dueOn && task.dueOn < now ? 'late' : task.state === 'doing' ? 'in_progress' : 'pending',
      left: task.items.length ? task.items.filter((x) => !x.done).length : undefined, of: task.items.length || undefined,
      workHref: null,
    });
  }

  const profile = profileDone(profileOf(record));
  if (profile < 100) alerts.push({ kind: 'profile', label: `Fiche remplie à ${profile} %`, detail: 'Ce que le jury lit', href: null, tone: 'warn' });

  /* Ses besoins choisis, avec ce qui les précise le plus. */
  const needs = record.needs
    .filter((n) => n.active)
    .map((n) => {
      const label = NEEDS.find((x) => x.key === n.need)?.fr ?? n.need;
      const amount = typeof n.data.amount === 'number' ? `${n.data.amount.toLocaleString('fr-FR')} ${String(n.data.currency ?? 'MAD')}` : '';
      return { need: n.need, label, detail: amount };
    });

  /* Les chiffres qui disent sa taille : le dernier connu de chacun, et sa courbe. */
  const KEYS = ['revenue', 'teamSize', 'equityRaised', 'activeClients'];
  const figures = (await kpisOf(orgId, false))
    .filter((k) => KEYS.includes(k.key))
    .sort((a, b) => KEYS.indexOf(a.key) - KEYS.indexOf(b.key))
    .map((k) => ({ key: k.key, label: k.label, type: k.type, currency: k.points.at(-1)?.currency ?? k.currency, points: k.points }));
  /* Un chiffre que la fiche tient sans le suivre comme KPI garde sa place, sans courbe. */
  const plain: [string, string, unknown][] = [
    ['teamSize', 'Effectif', record.teamSize],
    ['activeClients', 'Clients actifs', record.activeClients],
  ];
  for (const [key, label, value] of plain) {
    if (!figures.some((f) => f.key === key) && value !== null && value !== undefined) {
      figures.push({ key, label, type: 'number', currency: '', points: [{ period: '', value }] });
    }
  }
  const RANK = { late: 0, in_progress: 1, pending: 2 } as const;
  asked.sort((a, b) => RANK[a.status] - RANK[b.status] || (a.dueOn ?? '9').localeCompare(b.dueOn ?? '9'));
  return { candidacies, asked, alerts, needs, figures, profile };
}
