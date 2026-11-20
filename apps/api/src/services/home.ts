/**
 * La page d'accueil de l'équipe : ma journée, et le centre d'un coup d'œil.
 *
 * Everything here is read from what already exists — tasks, meetings, panels,
 * the knowledge base, offers, notifications, programme metrics — in the
 * centre the person is working in. Nothing is stored for it. Each list is
 * short on purpose: the page shows what is most urgent and leads elsewhere
 * for the rest.
 */
import { isWorkspaceAdmin, type StaffRole } from '@ceed/shared';
import { all, one } from '../db/client.js';
import * as repo from '../db/repo.js';
import { currentCenter, getCenter } from './centers.js';
import { pendingOffers } from './distribution.js';
import { programMetrics } from './programMetrics.js';
import { reviewsFor } from './reviews.js';
import { listTasks, waitingFor } from './tasks.js';

/** Aujourd'hui, à Casablanca — le jour qui compte pour l'équipe. */
const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' }).format(new Date());
const plusDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export interface HomeTodo {
  kind: 'task_late' | 'task_soon' | 'unblock' | 'validate' | 'report' | 'jury' | 'kb_review' | 'kb_validate' | 'offers';
  title: string;
  about: string;
  /** « Retard », « Aujourd'hui », « Vendredi »… */
  when: string;
  late: boolean;
  href: string;
}

export interface HomeEvent {
  date: string;
  time: string | null;
  kind: 'meeting' | 'committee' | 'deadline';
  title: string;
  sub: string;
  colour: string;
  href: string;
}

export interface HomeData {
  firstName: string;
  centerName: string;
  today: string;
  todo: HomeTodo[];
  todoTotal: number;
  agenda: HomeEvent[];
  sent: { id: string; kind: string; title: string; body: string; href: string; createdAt: string; program: string | null; colour: string | null }[];
  team: {
    recordId: string;
    name: string;
    state: 'event' | 'task' | 'idle' | 'away';
    now: string;
    href: string;
  }[];
  programs: {
    editionId: string;
    name: string;
    edition: string;
    colour: string;
    candidates: number;
    phase: string;
    funnel: { name: string; count: number }[];
    blockers: string[];
  }[];
  figures: { organisations: number; individuals: number; startups: number; joinedThisWeek: number };
}

const dayWord = (iso: string, today: string) => {
  if (iso < today) return 'Late';
  if (iso === today) return 'Today';
  if (iso === plusDays(today, 1)) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
};

export async function homeFor(me: { recordId: string; role: StaffRole }): Promise<HomeData> {
  const center = currentCenter();
  const today = todayLocal();
  const weekEnd = plusDays(today, 7);
  const person = await one<{ firstName: string; name: string }>('select first_name as "firstName", name from records where id = $1', [me.recordId]);
  const centerRow = await getCenter(center);

  /* ---- À faire ---- */
  const todo: HomeTodo[] = [];
  const mine = await listTasks({ ownerIds: [me.recordId], open: true, center });
  for (const t of mine) {
    if (!t.dueOn || t.dueOn > weekEnd) continue;
    const late = t.dueOn < today;
    todo.push({
      kind: late ? 'task_late' : 'task_soon', title: t.title, about: t.editionName || t.aboutName || 'Task',
      when: late ? 'Late' : dayWord(t.dueOn, today), late, href: '/tasks',
    });
  }
  for (const t of await waitingFor(me.recordId)) {
    const stuck = t.state === 'stuck';
    todo.push({
      kind: stuck ? 'unblock' : 'validate',
      title: `${stuck ? 'Unblock' : 'Validate'} “${t.title}”`,
      about: stuck ? t.stuckReason || 'Waiting on you' : t.validationNote || 'Waiting for your validation',
      when: 'Today', late: false, href: '/tasks',
    });
  }
  /* Mes comptes rendus de One to One : la séance est passée, rien n'est écrit. */
  const reports = await all<{ id: string; orgName: string; heldOn: string; programName: string }>(
    `select m.id, o.name as "orgName", m.held_on::text as "heldOn", p.name as "programName"
       from one_to_one_meetings m
       join candidates c on c.id = m.candidate_id join records o on o.id = c.org_id
       join editions e on e.id = c.edition_id join programs p on p.id = e.program_id
      where (m.person_id = $1 or m.with_ids ? $1) and p.center_id = $2
        and m.status in ('planned', 'held') and m.held_on < $3::date and m.report_submitted_at is null
      order by m.held_on limit 10`,
    [me.recordId, center, today],
  );
  for (const r of reports) {
    todo.push({ kind: 'report', title: `One to One report — ${r.orgName}`, about: r.programName, when: 'Late', late: true, href: `/meeting/${r.id}` });
  }
  /* Juré : les dossiers qui attendent sa note, dans un panel ouvert. */
  for (const panel of await reviewsFor(me.recordId).catch(() => [])) {
    const left = panel.state === 'open' ? panel.items.length - panel.done : 0;
    if (left > 0) {
      todo.push({
        kind: 'jury', title: `${left} file${left > 1 ? 's' : ''} to score — ${panel.committeeName}`,
        about: panel.programName, when: panel.heldOn ? dayWord(panel.heldOn, today) : 'Open', late: Boolean(panel.heldOn && panel.heldOn < today),
        href: `/review/${panel.sessionId}`,
      });
    }
  }
  /* Base de connaissances : à relire (pas les siennes), à valider s'il préside. */
  const kb = await all<{ entryId: string; title: string; status: string; author: string }>(
    `select e.id as "entryId", v.title, v.status, coalesce(r.name, '') as author
       from kb_versions v join kb_entries e on e.id = v.entry_id left join records r on r.id = v.author_id
      where e.center_id = $1 and v.status in ('to_review', 'to_validate') and (v.author_id is distinct from $2)
      order by v.updated_at desc limit 10`,
    [center, me.recordId],
  );
  const president = await one<{ value: string }>(
    `select value from settings where key = $1`,
    [center === 'ctr_maroc' ? 'kb.president' : `kb.president@${center}`],
  );
  for (const v of kb) {
    if (v.status === 'to_validate' && president?.value !== me.recordId) continue;
    todo.push({
      kind: v.status === 'to_validate' ? 'kb_validate' : 'kb_review',
      title: `${v.status === 'to_validate' ? 'Validate' : 'Review'} “${v.title}”`,
      about: v.author ? `Knowledge base · by ${v.author}` : 'Knowledge base',
      when: 'This week', late: false, href: `/knowledge/${v.entryId}`,
    });
  }
  /* Ce que seul un administrateur décide. */
  if (isWorkspaceAdmin(me.role)) {
    const offers = await pendingOffers(center);
    if (offers) {
      todo.push({
        kind: 'offers', title: `${offers} programme${offers > 1 ? 's' : ''} proposed by the network`,
        about: 'Publish in your catalogue, or decline', when: 'To decide', late: false, href: '/offers',
      });
    }
  }
  const rank = (t: HomeTodo) => (t.late ? 0 : t.kind === 'unblock' || t.kind === 'validate' ? 1 : t.when === 'Today' ? 2 : 3);
  todo.sort((a, b) => rank(a) - rank(b));

  /* ---- Agenda, 7 jours ---- */
  const agenda: HomeEvent[] = [];
  const meetings = await all<{ id: string; heldOn: string; startTime: string | null; orgName: string; programName: string; colour: string; prep: boolean }>(
    `select m.id, m.held_on::text as "heldOn", m.start_time as "startTime", o.name as "orgName", p.name as "programName", p.colour,
            (m.prep_submitted_at is not null) as prep
       from one_to_one_meetings m
       join candidates c on c.id = m.candidate_id join records o on o.id = c.org_id
       join editions e on e.id = c.edition_id join programs p on p.id = e.program_id
      where (m.person_id = $1 or m.with_ids ? $1) and p.center_id = $2 and m.status = 'planned'
        and m.held_on between $3::date and $4::date
      order by m.held_on, m.start_time`,
    [me.recordId, center, today, weekEnd],
  );
  for (const m of meetings) {
    agenda.push({
      date: m.heldOn, time: m.startTime, kind: 'meeting', title: `One to One — ${m.orgName}`,
      sub: `${m.programName}${m.prep ? ' · preparation received' : ''}`, colour: m.colour, href: `/meeting/${m.id}`,
    });
  }
  const sessions = await all<{ id: string; heldOn: string; startsAt: string; name: string; programName: string; editionId: string; colour: string }>(
    `select s.id, s.held_on::text as "heldOn", coalesce(s.windows->0->>'startsAt', '') as "startsAt", s.name, p.name as "programName", e.id as "editionId", p.colour
       from committee_sessions s join blocks b on b.id = s.block_id join phases ph on ph.id = b.phase_id
       join tracks t on t.id = ph.track_id join editions e on e.id = t.edition_id join programs p on p.id = e.program_id
      where p.center_id = $1 and s.held_on between $2::date and $3::date and e.deleted_at is null
      order by s.held_on, 3 limit 10`,
    [center, today, weekEnd],
  );
  for (const s of sessions) {
    agenda.push({ date: s.heldOn, time: s.startsAt || null, kind: 'committee', title: s.name, sub: s.programName, colour: s.colour, href: `/editions/${s.editionId}?tab=committees` });
  }
  /* Les échéances des programmes : un appel qui ferme, une liste de pièces qui arrive à terme. */
  const deadlines = await all<{ type: string; name: string; closesAt: string; programName: string; editionId: string; colour: string }>(
    `select b.type, b.name, (b.config->>'closesAt') as "closesAt", p.name as "programName", e.id as "editionId", p.colour
       from blocks b join phases ph on ph.id = b.phase_id join tracks t on t.id = ph.track_id
       join editions e on e.id = t.edition_id join programs p on p.id = e.program_id
      where p.center_id = $1 and e.deleted_at is null and e.status = 'Live' and b.type in ('application', 'deliverable')
        and nullif(b.config->>'closesAt', '') is not null
        and (b.config->>'closesAt')::date between $2::date and $3::date`,
    [center, today, weekEnd],
  );
  for (const d of deadlines) {
    agenda.push({
      date: d.closesAt.slice(0, 10), time: null, kind: 'deadline',
      title: d.type === 'application' ? `Applications close — ${d.programName}` : `Deadline — ${d.name}`,
      sub: d.programName, colour: '#d8305a', href: `/editions/${d.editionId}?tab=${d.type === 'application' ? 'startups' : 'deliverables'}`,
    });
  }
  agenda.sort((a, b) => (a.date + (a.time ?? '99')).localeCompare(b.date + (b.time ?? '99')));

  /* ---- Envois des startups : ses notifications non lues de ce genre ---- */
  const sentRows = await all<{ id: string; kind: string; title: string; body: string; href: string; createdAt: string }>(
    `select id, kind, title, body, href, created_at::text as "createdAt" from notifications
      where record_id = $1 and read_at is null and (center_id = $2 or center_id is null)
        and kind in ('deliverables_complete', 'prep_submitted', 'application_new', 'task_done')
      order by created_at desc limit 6`,
    [me.recordId, center],
  );
  const sent: HomeData['sent'] = [];
  for (const n of sentRows) {
    /* Le programme dont il s'agit, retrouvé par le lien : une édition, ou un rendez-vous. */
    const edition = n.href.match(/^\/editions\/([^/?]+)/)?.[1];
    const meeting = n.href.match(/^\/meeting\/([^/?]+)/)?.[1];
    const prog = edition
      ? await one<{ name: string; colour: string }>('select p.name, p.colour from editions e join programs p on p.id = e.program_id where e.id = $1', [edition])
      : meeting
        ? await one<{ name: string; colour: string }>(
            `select p.name, p.colour from one_to_one_meetings m join candidates c on c.id = m.candidate_id
               join editions e on e.id = c.edition_id join programs p on p.id = e.program_id where m.id = $1`,
            [meeting],
          )
        : null;
    sent.push({ ...n, program: prog?.name ?? null, colour: prog?.colour ?? null });
  }

  /* ---- L'équipe en ce moment ---- */
  const staff = await all<{ recordId: string; name: string; awayUntil: string | null; awayNote: string }>(
    `select a.record_id as "recordId", r.name, a.away_until::text as "awayUntil", a.away_note as "awayNote"
       from center_staff cs join accounts a on a.id = cs.account_id join records r on r.id = a.record_id
      where cs.center_id = $1 and a.disabled_at is null
      order by r.name`,
    [center],
  );
  const team: HomeData['team'] = [];
  for (const s of staff) {
    const href = `/tasks?owner=${s.recordId}`;
    if (s.awayUntil && s.awayUntil >= today) {
      team.push({ recordId: s.recordId, name: s.name, state: 'away', now: s.awayNote || `Away until ${s.awayUntil}`, href });
      continue;
    }
    /* Un rendez-vous qui se tient maintenant, à l'heure de Casablanca. */
    const live = await one<{ orgName: string }>(
      `select o.name as "orgName" from one_to_one_meetings m
         join candidates c on c.id = m.candidate_id join records o on o.id = c.org_id
        where (m.person_id = $1 or m.with_ids ? $1) and m.status = 'planned' and m.held_on = $2::date and m.start_time is not null
          and (now() at time zone 'Africa/Casablanca')::time >= m.start_time::time
          and (now() at time zone 'Africa/Casablanca')::time < m.start_time::time + make_interval(mins => m.duration_minutes)
        limit 1`,
      [s.recordId, today],
    );
    if (live) {
      team.push({ recordId: s.recordId, name: s.name, state: 'event', now: `One to One — ${live.orgName}`, href });
      continue;
    }
    const doing = await one<{ title: string }>(
      `select t.title from tasks t
        where t.center_id = $2 and t.state = 'doing'
          and exists (select 1 from task_owners x where x.task_id = t.id and x.record_id = $1)
        order by case t.priority when 'high' then 0 when 'medium' then 1 else 2 end, t.due_on nulls last limit 1`,
      [s.recordId, center],
    );
    team.push(
      doing
        ? { recordId: s.recordId, name: s.name, state: 'task', now: doing.title, href }
        : { recordId: s.recordId, name: s.name, state: 'idle', now: 'Nothing in progress', href },
    );
  }

  /* ---- Programmes en cours ---- */
  const programs: HomeData['programs'] = [];
  for (const p of await repo.listPrograms({ center })) {
    if (p.isTest) continue;
    for (const e of p.editions.filter((x) => x.status === 'Live')) {
      const m = await programMetrics(e.id).catch(() => null);
      if (!m) continue;
      const steps = m.funnel[0]?.steps ?? [];
      const reached = steps.filter((s) => s.count > 0);
      const missing = m.deliverables.reduce((n, d) => n + Math.max(0, d.asked - d.sent), 0);
      const lateReports = m.oneToOne.reduce((n, o) => n + Math.max(0, o.held - o.reports), 0);
      programs.push({
        editionId: e.id, name: p.name, edition: e.name, colour: p.colour,
        candidates: m.applications.total - m.applications.withdrawn,
        phase: reached[reached.length - 1]?.name ?? steps[0]?.name ?? '—',
        funnel: steps.slice(0, 5).map((s) => ({ name: s.name, count: s.count })),
        blockers: [
          ...(missing ? [`${missing} startup${missing > 1 ? 's' : ''} still owe documents`] : []),
          ...(lateReports ? [`${lateReports} report${lateReports > 1 ? 's' : ''} not written`] : []),
        ],
      });
    }
  }

  /* ---- Le centre en chiffres ---- */
  const figures = await one<HomeData['figures']>(
    `select count(*) filter (where r.kind = 'org')::int as organisations,
            count(*) filter (where r.kind = 'person')::int as individuals,
            (select count(distinct c.org_id)::int from candidates c join editions e on e.id = c.edition_id
               join programs p on p.id = e.program_id
              where p.center_id = $1 and not p.is_test and c.deleted_at is null and c.status <> 'Withdrawn') as startups,
            count(*) filter (where cm.created_at > now() - interval '7 days')::int as "joinedThisWeek"
       from center_members cm join records r on r.id = cm.record_id
      where cm.center_id = $1 and r.deleted_at is null and r.test_owner is null`,
    [center],
  );

  return {
    firstName: person?.firstName || person?.name.split(' ')[0] || '',
    centerName: centerRow?.name ?? '',
    today,
    todo: todo.slice(0, 8),
    todoTotal: todo.length,
    agenda: agenda.slice(0, 10),
    sent,
    team,
    programs,
    figures: figures ?? { organisations: 0, individuals: 0, startups: 0, joinedThisWeek: 0 },
  };
}
