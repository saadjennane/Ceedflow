import {
  orderedBlocks,
  type Block,
  type Candidate,
  type CandidateStatus,
  type SelectionConfig,
  type TrackWithPhases,
} from '@ceed/shared';
import * as repo from '../db/repo.js';
import { scoresByCandidate } from './scoring.js';

export interface SelectionRow {
  candidate: Candidate;
  score: number | null;
  /** What the configured method produces, before any human override. */
  computed: 'pass' | 'fail';
  outcome: 'pass' | 'fail';
  overridden: boolean;
}

export interface SelectionView {
  block: Block;
  config: SelectionConfig;
  sourceBlockId: string | null;
  published: boolean;
  rows: SelectionRow[];
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
  const all = await repo.listCandidates(context.editionId, track.id);
  const intake = (await intakeFor(track, blockId, all)).filter((c) => c.status !== 'Withdrawn');

  const source = resolveSource(track, block);
  const grouped = source ? await scoresByCandidate(source) : null;

  const scored = intake.map((candidate) => ({
    candidate,
    score: grouped?.get(candidate.id)?.consensus ?? null,
  }));

  // A candidate with no score never passes automatically — the team decides.
  const passes = new Set<string>();
  if (config.method === 'threshold') {
    for (const row of scored) if (row.score !== null && row.score >= config.threshold) passes.add(row.candidate.id);
  } else if (config.method === 'top_n') {
    [...scored]
      .filter((r) => r.score !== null)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, config.topN)
      .forEach((r) => passes.add(r.candidate.id));
  }

  const stored = new Map((await repo.listOutcomes(blockId)).map((o) => [o.candidateId, o]));
  const rows: SelectionRow[] = scored.map(({ candidate, score }) => {
    const computed: 'pass' | 'fail' = passes.has(candidate.id) ? 'pass' : 'fail';
    const saved = stored.get(candidate.id);
    return {
      candidate,
      score,
      computed,
      outcome: saved?.outcome ?? computed,
      overridden: saved?.overridden ?? false,
    };
  });

  rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.candidate.orgName.localeCompare(b.candidate.orgName));

  return {
    block,
    config,
    sourceBlockId: source?.id ?? null,
    published: Boolean(config.publishedAt),
    rows,
    passCount: rows.filter((r) => r.outcome === 'pass').length,
    failCount: rows.filter((r) => r.outcome === 'fail').length,
  };
}

/**
 * Writes the decision: outcomes are stored per candidate, and the candidate's
 * own status reflects the last published selection they went through.
 */
export async function publishSelection(blockId: string): Promise<SelectionView | null> {
  const view = await selectionView(blockId);
  if (!view) return null;

  for (const row of view.rows) {
    await repo.setOutcome(blockId, row.candidate.id, row.outcome, row.overridden);
  }

  const isCohort = view.config.outputKind === 'cohort';
  const passStatus: CandidateStatus = isCohort ? 'Selected' : 'Shortlisted';
  const updates = view.rows
    .filter((r) => r.candidate.status !== 'Withdrawn')
    .map((r) => ({ id: r.candidate.id, status: r.outcome === 'pass' ? passStatus : 'Not selected' }));
  await repo.setCandidateStatuses(updates);

  await repo.updateBlock(blockId, { config: { publishedAt: new Date().toISOString() } });
  return selectionView(blockId);
}

export async function unpublishSelection(blockId: string): Promise<SelectionView | null> {
  await repo.updateBlock(blockId, { config: { publishedAt: null } });
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
