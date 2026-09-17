import {
  orderedBlocks,
  type Block,
  type BlockOutcome,
  type Candidate,
  type CandidateStatus,
  type SelectionConfig,
  type TrackWithPhases,
} from '@ceed/shared';
import * as repo from '../db/repo.js';
import { outcomesOf, scoresByCandidate } from './scoring.js';

/** How a startup got onto this list. */
export type Arrival = 'funnel' | 'manual' | 'status';

export interface SelectionRow {
  candidate: Candidate;
  score: number | null;
  /** The status the scoring block above gave them, if any. */
  outcomeId: string | null;
  arrival: Arrival;
  /** What the configured method produces, before any human override. */
  computed: 'pass' | 'fail';
  outcome: 'pass' | 'fail';
  overridden: boolean;
  /**
   * Publishing freezes each decision, so a late score or a changed rule does not
   * move a cohort that has been announced. This says the rule has since drifted.
   */
  stale: boolean;
  /** On the list since the last publication, so nothing has been announced for it. */
  pending: boolean;
}

export interface SelectionView {
  block: Block;
  config: SelectionConfig;
  sourceBlockId: string | null;
  sourceName: string | null;
  /** The statuses the scoring block hands out, so the UI can label them. */
  sourceOutcomes: BlockOutcome[];
  /** Every upstream block that hands out statuses, and what it can hand out. */
  statusSources: { blockId: string; name: string; type: string; outcomes: BlockOutcome[] }[];
  /** The one currently recruiting into this list. */
  includeFromBlockId: string | null;
  published: boolean;
  rows: SelectionRow[];
  /** Startups in the track that are not on the list, and could be added. */
  pool: { candidate: Candidate; score: number | null; outcomeId: string | null }[];
  passCount: number;
  failCount: number;
}

function trackOf(tracks: TrackWithPhases[], blockId: string): TrackWithPhases | null {
  return tracks.find((t) => t.phases.some((p) => p.blocks.some((b) => b.id === blockId))) ?? null;
}

/**
 * Candidates arriving at a block: those who passed the closest published
 * selection upstream, or everyone in the track if there is none.
 */
export async function intakeFor(track: TrackWithPhases, blockId: string, candidates: Candidate[]): Promise<Candidate[]> {
  const ordered = orderedBlocks(track);
  const index = ordered.findIndex((b) => b.id === blockId);
  const upstream = ordered
    .slice(0, index === -1 ? ordered.length : index)
    .filter((b) => b.type === 'selection' && (b.config as SelectionConfig).publishedAt)
    .pop();
  if (!upstream) return candidates;
  const outcomes = await repo.listOutcomes(upstream.id);
  const passed = new Set(outcomes.filter((o) => o.outcome === 'pass').map((o) => o.candidateId));
  return candidates.filter((c) => passed.has(c.id));
}

/**
 * The block feeding a selection its scores: explicit, else the nearest scoring
 * block upstream. A committee scores too, so a jury day can drive the cut.
 */
function resolveSource(track: TrackWithPhases, block: Block): Block | null {
  const config = block.config as SelectionConfig;
  const ordered = orderedBlocks(track);
  if (config.sourceBlockId) return ordered.find((b) => b.id === config.sourceBlockId) ?? null;
  const index = ordered.findIndex((b) => b.id === block.id);
  return (
    ordered
      .slice(0, index === -1 ? ordered.length : index)
      .filter((b) => b.type === 'evaluation' || b.type === 'committee')
      .pop() ?? null
  );
}

export async function selectionView(blockId: string): Promise<SelectionView | null> {
  const context = await repo.blockContext(blockId);
  if (!context || context.block.type !== 'selection') return null;
  const detail = await repo.getEditionDetail(context.editionId);
  const track = detail ? trackOf(detail.tracks, blockId) : null;
  if (!track) return null;

  const block = context.block;
  const config = block.config as SelectionConfig;
  const everyone = (await repo.listCandidates(context.editionId, track.id)).filter((c) => c.status !== 'Withdrawn');

  const source = resolveSource(track, block);
  const grouped = source ? await scoresByCandidate(source) : null;
  const statuses = source ? new Map((await repo.listBlockOutcomes(source.id)).map((o) => [o.candidateId, o])) : null;

  // Any block upstream that hands out statuses can recruit into this list.
  const index = orderedBlocks(track).findIndex((b) => b.id === blockId);
  const statusSources = orderedBlocks(track)
    .slice(0, index === -1 ? undefined : index)
    .filter((b) => b.type === 'evaluation' || b.type === 'committee')
    .map((b) => ({ blockId: b.id, name: b.name, type: b.type, outcomes: outcomesOf(b) }));

  const includeFrom = config.includeFromBlockId
    ? (statusSources.find((b) => b.blockId === config.includeFromBlockId) ?? null)
    : source
      ? (statusSources.find((b) => b.blockId === source.id) ?? null)
      : null;
  const recruiting = includeFrom
    ? new Map((await repo.listBlockOutcomes(includeFrom.blockId)).map((o) => [o.candidateId, o]))
    : null;

  /* ---- Who is on the list ---- */
  const fromFunnel = new Set((await intakeFor(track, blockId, everyone)).map((c) => c.id));
  const byHand = new Set(config.includeCandidateIds);
  const wanted = new Set(config.includeOutcomeIds);
  const byStatus = new Set(
    wanted.size && recruiting
      ? everyone
          .filter((c) => {
            const outcome = recruiting.get(c.id)?.outcomeId;
            return outcome && wanted.has(outcome);
          })
          .map((c) => c.id)
      : [],
  );

  const arrivalOf = (id: string): Arrival | null => {
    // Arriving through the funnel is the plain case, even if a rule would also
    // have brought them in — only someone the funnel left out is worth flagging.
    if (fromFunnel.has(id)) return 'funnel';
    if (byHand.has(id)) return 'manual';
    if (byStatus.has(id)) return 'status';
    return null;
  };

  const roster = everyone.filter((c) => arrivalOf(c.id) !== null);
  const scoreOf = (id: string) => grouped?.get(id)?.consensus ?? null;

  // A candidate with no score never passes automatically — the team decides.
  const passes = new Set<string>();
  if (config.method === 'threshold') {
    for (const c of roster) {
      const score = scoreOf(c.id);
      if (score !== null && score >= config.threshold) passes.add(c.id);
    }
  } else if (config.method === 'top_n') {
    [...roster]
      .filter((c) => scoreOf(c.id) !== null)
      .sort((a, b) => (scoreOf(b.id) ?? 0) - (scoreOf(a.id) ?? 0))
      .slice(0, config.topN)
      .forEach((c) => passes.add(c.id));
  }

  const stored = new Map((await repo.listOutcomes(blockId)).map((o) => [o.candidateId, o]));
  const rows: SelectionRow[] = roster.map((candidate) => {
    const computed: 'pass' | 'fail' = passes.has(candidate.id) ? 'pass' : 'fail';
    const saved = stored.get(candidate.id);
    const outcome = saved?.outcome ?? computed;
    return {
      candidate,
      score: scoreOf(candidate.id),
      outcomeId: statuses?.get(candidate.id)?.outcomeId ?? null,
      arrival: arrivalOf(candidate.id) as Arrival,
      computed,
      outcome,
      overridden: saved?.overridden ?? false,
      stale: Boolean(saved) && !saved?.overridden && outcome !== computed,
      pending: Boolean(config.publishedAt) && !saved,
    };
  });

  rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.candidate.orgName.localeCompare(b.candidate.orgName));

  const onList = new Set(roster.map((c) => c.id));
  return {
    block,
    config,
    sourceBlockId: source?.id ?? null,
    sourceName: source?.name ?? null,
    sourceOutcomes: source ? outcomesOf(source) : [],
    statusSources,
    includeFromBlockId: includeFrom?.blockId ?? null,
    published: Boolean(config.publishedAt),
    rows,
    pool: everyone
      .filter((c) => !onList.has(c.id))
      .map((candidate) => ({
        candidate,
        score: scoreOf(candidate.id),
        outcomeId: (recruiting ?? statuses)?.get(candidate.id)?.outcomeId ?? null,
      })),
    passCount: rows.filter((r) => r.outcome === 'pass').length,
    failCount: rows.filter((r) => r.outcome === 'fail').length,
  };
}

/**
 * Puts startups on the list that the funnel did not send — by name, or by a
 * status the block above gave them. `outcome` lands them straight away, which is
 * what makes this an override of the score rule rather than a second chance at it.
 */
export async function addToSelection(
  blockId: string,
  input: {
    candidateIds?: string[];
    fromOutcomeIds?: string[];
    fromBlockId?: string | null;
    outcome?: 'pass' | 'fail';
  },
): Promise<SelectionView | null> {
  const block = await repo.getBlock(blockId);
  if (!block || block.type !== 'selection') return null;
  const config = block.config as SelectionConfig;

  // Who was already listed, so a forced outcome only touches who this call brings in.
  const before = await selectionView(blockId);
  const listed = new Set(before?.rows.map((r) => r.candidate.id) ?? []);

  const includeCandidateIds = [...new Set([...config.includeCandidateIds, ...(input.candidateIds ?? [])])];
  // Switching the recruiting block starts its status list afresh — the ids of one
  // block's statuses mean nothing in another's.
  const switching = input.fromBlockId !== undefined && input.fromBlockId !== config.includeFromBlockId;
  const includeOutcomeIds = [
    ...new Set([...(switching ? [] : config.includeOutcomeIds), ...(input.fromOutcomeIds ?? [])]),
  ];
  await repo.updateBlock(blockId, {
    config: {
      includeCandidateIds,
      includeOutcomeIds,
      ...(input.fromBlockId === undefined ? {} : { includeFromBlockId: input.fromBlockId }),
    },
  });

  const view = await selectionView(blockId);
  if (!view) return null;

  if (input.outcome) {
    const touched = new Set(input.candidateIds ?? []);
    if (input.fromOutcomeIds?.length) {
      view.rows.filter((r) => !listed.has(r.candidate.id)).forEach((r) => touched.add(r.candidate.id));
    }
    for (const candidateId of touched) {
      const row = view.rows.find((r) => r.candidate.id === candidateId);
      if (!row) continue;
      await repo.setOutcome(blockId, candidateId, input.outcome, input.outcome !== row.computed);
    }
    if (view.published) await writeStatuses(blockId);
  }
  return selectionView(blockId);
}

/** Takes a hand-added startup back off the list. */
export async function removeFromSelection(blockId: string, candidateId: string): Promise<SelectionView | null> {
  const block = await repo.getBlock(blockId);
  if (!block || block.type !== 'selection') return null;
  const config = block.config as SelectionConfig;
  await repo.updateBlock(blockId, {
    config: { includeCandidateIds: config.includeCandidateIds.filter((id) => id !== candidateId) },
  });
  await repo.clearOutcome(blockId, candidateId);
  return selectionView(blockId);
}

/** Pushes the published decision onto every candidate's own status. */
async function writeStatuses(blockId: string): Promise<void> {
  const view = await selectionView(blockId);
  if (!view) return;
  const passStatus: CandidateStatus = view.config.outputKind === 'cohort' ? 'Selected' : 'Shortlisted';
  await repo.setCandidateStatuses(
    view.rows
      .filter((r) => r.candidate.status !== 'Withdrawn')
      .map((r) => ({ id: r.candidate.id, status: r.outcome === 'pass' ? passStatus : 'Not selected' })),
  );
}

/**
 * Publishing applies the rule as it stands, keeps the calls made by hand, writes
 * each candidate's status and opens the gate downstream. Run it again whenever a
 * late score or a new arrival has left the announced decision out of line — it
 * is one explicit act rather than a state to toggle off and on.
 */
export async function publishSelection(blockId: string): Promise<SelectionView | null> {
  const view = await selectionView(blockId);
  if (!view) return null;

  for (const row of view.rows) {
    // A hand-made call is kept; everything else takes what the rule says now.
    const outcome = row.overridden ? row.outcome : row.computed;
    await repo.setOutcome(blockId, row.candidate.id, outcome, row.overridden);
  }

  await writeStatuses(blockId);
  await repo.updateBlock(blockId, { config: { publishedAt: new Date().toISOString() } });
  return selectionView(blockId);
}

/** A single reversible decision — a withdrawal, a repêchage. */
export async function overrideOutcome(
  blockId: string,
  candidateId: string,
  outcome: 'pass' | 'fail',
): Promise<SelectionView | null> {
  const view = await selectionView(blockId);
  if (!view) return null;
  const row = view.rows.find((r) => r.candidate.id === candidateId);
  if (!row) return view;

  await repo.setOutcome(blockId, candidateId, outcome, outcome !== row.computed);

  if (view.published) {
    const passStatus: CandidateStatus = view.config.outputKind === 'cohort' ? 'Selected' : 'Shortlisted';
    if (row.candidate.status !== 'Withdrawn') {
      await repo.setCandidateStatuses([
        { id: candidateId, status: outcome === 'pass' ? passStatus : 'Not selected' },
      ]);
    }
  }
  return selectionView(blockId);
}

/** Counts at each funnel node, in track order. */
export async function funnelFor(editionId: string, trackId: string) {
  const detail = await repo.getEditionDetail(editionId);
  const track = detail?.tracks.find((t) => t.id === trackId);
  if (!track) return [];
  const candidates = await repo.listCandidates(editionId, trackId);
  const steps: { blockId: string; name: string; type: string; count: number }[] = [];
  for (const block of orderedBlocks(track)) {
    if (block.type === 'application') {
      steps.push({ blockId: block.id, name: block.name, type: block.type, count: candidates.length });
    } else if (block.type === 'selection') {
      const outcomes = await repo.listOutcomes(block.id);
      steps.push({
        blockId: block.id,
        name: block.name,
        type: block.type,
        count: outcomes.filter((o) => o.outcome === 'pass').length,
      });
    }
  }
  return steps;
}
