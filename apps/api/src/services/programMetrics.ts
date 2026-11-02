/**
 * Les indicateurs du programme qui se lisent dans ce qui existe déjà.
 *
 * Nothing is asked of anybody here: candidacies, the funnel, the committees,
 * the One to One, the deliverables and the sheets of the cohort are counted as
 * they stand. Where the platform does not know something — whether a startup
 * actually sat in front of a committee — it does not claim to: it says what
 * the startups answered, not who came.
 */
import { orderedBlocks, profileDone, profileOf, type ProgramMetrics } from '@ceed/shared';
import { all } from '../db/client.js';
import * as dir from '../db/directory.js';
import * as repo from '../db/repo.js';
import { HttpError } from '../routes/util.js';
import { deliverableView } from './deliverables.js';
import { funnelFor } from './selection.js';

const rate = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null);

export async function programMetrics(editionId: string): Promise<ProgramMetrics> {
  const detail = await repo.getEditionDetail(editionId);
  if (!detail) throw new HttpError(404, 'Edition not found.');
  const candidates = await repo.listCandidates(editionId);
  const cohort = candidates.filter((c) => c.status === 'Selected');

  const funnel: ProgramMetrics['funnel'] = [];
  for (const track of detail.tracks) {
    const steps = await funnelFor(editionId, track.id);
    funnel.push({
      track: track.name,
      steps: steps.map((s, i) => ({ name: s.name, count: s.count, rate: i === 0 ? null : rate(s.count, steps[i - 1]!.count) })),
    });
  }

  const blocks = detail.tracks.flatMap((t) => orderedBlocks(t));
  const committees: ProgramMetrics['committees'] = [];
  const oneToOne: ProgramMetrics['oneToOne'] = [];
  const deliverables: ProgramMetrics['deliverables'] = [];
  for (const b of blocks) {
    if (b.type === 'committee') {
      const rows = await all<{ state: string; n: number }>(
        `select a.rsvp_state as state, count(*)::int as n
           from committee_assignments a join committee_sessions s on s.id = a.session_id
          where s.block_id = $1 group by a.rsvp_state`,
        [b.id],
      );
      const n = (state: string) => rows.find((r) => r.state === state)?.n ?? 0;
      const convoked = rows.reduce((sum, r) => sum + r.n, 0);
      committees.push({ name: b.name, convoked, confirmed: n('confirmed'), declined: n('declined'), pending: n('pending'), confirmRate: rate(n('confirmed'), convoked) });
    } else if (b.type === 'one_to_one') {
      const rows = await all<{ status: string; n: number; reports: number }>(
        `select status, count(*)::int as n, count(report_submitted_at)::int as reports
           from one_to_one_meetings where block_id = $1 group by status`,
        [b.id],
      );
      const n = (status: string) => rows.find((r) => r.status === status)?.n ?? 0;
      const held = n('held');
      const reports = rows.reduce((sum, r) => sum + r.reports, 0);
      oneToOne.push({
        name: b.name,
        planned: n('planned'),
        held,
        noShow: n('no_show'),
        cancelled: n('cancelled'),
        attendance: rate(held, held + n('no_show')),
        reports,
        reportRate: rate(reports, held),
      });
    } else if (b.type === 'deliverable') {
      const view = await deliverableView(b.id);
      const rows = view?.rows ?? [];
      const sent = rows.filter((r) => !r.owes).length;
      const accepted = rows.filter((r) => r.complete && r.required > 0).length;
      deliverables.push({ name: b.name, asked: rows.length, sent, accepted, sentRate: rate(sent, rows.length) });
    }
  }

  /* Les fiches de la cohorte : où elles en sont, en moyenne. */
  const done: number[] = [];
  for (const c of cohort) {
    const record = await dir.getRecord(c.orgId);
    if (record) done.push(profileDone(profileOf(record)));
  }

  return {
    applications: {
      total: candidates.length,
      withdrawn: candidates.filter((c) => c.status === 'Withdrawn').length,
    },
    cohort: cohort.length,
    funnel,
    committees,
    oneToOne,
    deliverables,
    profiles: {
      average: done.length ? Math.round(done.reduce((a, b) => a + b, 0) / done.length) : null,
      complete: done.filter((d) => d === 100).length,
      of: done.length,
    },
  };
}
