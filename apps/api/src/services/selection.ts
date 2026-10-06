import {
  committeeForEvaluation,
  orderedBlocks,
  selectionSource,
  type Block,
  type BlockOutcome,
  type Candidate,
  type CandidateStatus,
  type SelectionConfig,
  type TrackWithPhases,
} from '@ceed/shared';
import * as repo from '../db/repo.js';
import { outcomesByCandidate, outcomesOf, scoresByCandidate } from './scoring.js';

/** How a startup got onto this list. */
export interface SelectionRow {
  candidate: Candidate;
  score: number | null;
  /** The status the scoring block above gave them, if any. */
  outcomeId: string | null;
  /** What the configured method produces, before any human override. */
  computed: SelectionCall;
  outcome: SelectionCall;
  overridden: boolean;
  /**
   * Publishing freezes each decision, so a late score or a changed rule does not
   * move a cohort that has been announced. This says the rule has since drifted.
   */
  stale: boolean;
  /** On the list since the last publication, so nothing has been announced for it. */
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
  published: boolean;
  rows: SelectionRow[];
  passCount: number;
  waitCount: number;
  failCount: number;
}

export function trackOf(tracks: TrackWithPhases[], blockId: string): TrackWithPhases | null {
  return tracks.find((t) => t.phases.some((p) => p.blocks.some((b) => b.id === blockId))) ?? null;
}

/**
 * Who passes a selection **as things stand**, not as they were announced.
 *
 * The rule decides, except where somebody decided by hand: a repêchage or a
 * withdrawal is a call, and a later score must not quietly undo it. Everything
 * else follows the statuses of the moment, which is why changing one moves the
 * count the same second.
 */
/** What a selection can answer. Only `pass` opens the door downstream. */
export type SelectionCall = 'pass' | 'wait' | 'fail';

/**
 * The rule, in one place.
 *
 * A status named in both lists passes: moving on outranks waiting, and the
 * alternative was a result that depended on which array happened to be read
 * first.
 */
export function callFor(config: SelectionConfig, outcomeId: string | null | undefined): SelectionCall {
  if (!outcomeId) return 'fail';
  if (config.passOutcomeIds.includes(outcomeId)) return 'pass';
  if (config.waitOutcomeIds.includes(outcomeId)) return 'wait';
  return 'fail';
}

export async function passSetOf(
  track: TrackWithPhases,
  block: Block,
  candidates: Candidate[],
): Promise<Set<string>> {
  const config = block.config as SelectionConfig;
  const source = selectionSource(track, block);
  const statuses = source ? await outcomesByCandidate(source) : null;
  const stored = new Map((await repo.listOutcomes(block.id)).map((o) => [o.candidateId, o]));

  const passed = new Set<string>();
  for (const candidate of candidates) {
    const saved = stored.get(candidate.id);
    if (saved?.overridden) {
      if (saved.outcome === 'pass') passed.add(candidate.id);
      continue;
    }
    // Waiting is not passing: a startup held by the committee stays on this
    // side of the door until somebody moves it.
    if (callFor(config, statuses?.get(candidate.id)?.outcomeId) === 'pass') passed.add(candidate.id);
  }
  return passed;
}

/**
 * Candidates arriving at a block: those who pass the closest selection
 * upstream, or everyone in the track if there is none.
 *
 * Reads the rule rather than the last announcement, so a status changed this
 * morning is felt downstream this morning. Publishing keeps its own job —
 * recording what was announced, and when — but it is no longer the gate.
 */
export async function intakeFor(track: TrackWithPhases, blockId: string, candidates: Candidate[]): Promise<Candidate[]> {
  const ordered = orderedBlocks(track);
  const index = ordered.findIndex((b) => b.id === blockId);
  const upstream = ordered
    .slice(0, index === -1 ? ordered.length : index)
    .filter((b) => b.type === 'selection')
    .pop();
  if (!upstream) return candidates;
  const passed = await passSetOf(track, upstream, candidates);
  return candidates.filter((c) => passed.has(c.id));
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

  const source = selectionSource(track, block);
  const grouped = source ? await scoresByCandidate(source) : null;
  const statuses = source ? await outcomesByCandidate(source) : null;

  // Every block before this one that hands out statuses, so the panel can offer
  // them. A committee is named by the evaluation that scores it.
  const ordered = orderedBlocks(track);
  const index = ordered.findIndex((b) => b.id === blockId);
  const statusSources = ordered
    .slice(0, index === -1 ? undefined : index)
    .filter((b) => b.type === 'evaluation')
    .map((b) => ({ blockId: b.id, name: b.name, type: b.type, outcomes: outcomesOf(b) }));

  /* ---- Who is on the list, and who passes ---- */
  // The funnel decides who is here: everyone the selection above let through.
  const roster = await intakeFor(track, blockId, everyone);
  const scoreOf = (id: string) => grouped?.get(id)?.consensus ?? null;

  // And the statuses decide who moves on. Nothing else does — a startup whose
  // status is wrong is fixed where the status is given, not by a second rule.
  const calls = new Map<string, SelectionCall>();
  for (const candidate of roster) {
    calls.set(candidate.id, callFor(config, statuses?.get(candidate.id)?.outcomeId));
  }

  const stored = new Map((await repo.listOutcomes(blockId)).map((o) => [o.candidateId, o]));
  const rows: SelectionRow[] = roster.map((candidate) => {
    const computed = calls.get(candidate.id) ?? 'fail';
    const saved = stored.get(candidate.id);
    // A saved row records what was announced; it no longer governs. Only a call
    // made by hand outranks the rule.
    const outcome = saved?.overridden ? saved.outcome : computed;
    return {
      candidate,
      score: scoreOf(candidate.id),
      outcomeId: statuses?.get(candidate.id)?.outcomeId ?? null,
      computed,
      outcome,
      overridden: saved?.overridden ?? false,
      // Told one thing, the rule now says another.
      stale: Boolean(saved) && !saved?.overridden && saved?.outcome !== computed,
    };
  });

  rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.candidate.orgName.localeCompare(b.candidate.orgName));

  return {
    block,
    config,
    sourceBlockId: source?.id ?? null,
    sourceName: source?.name ?? null,
    sourceOutcomes: source ? outcomesOf(source) : [],
    statusSources,
    published: Boolean(config.publishedAt),
    rows,
    passCount: rows.filter((r) => r.outcome === 'pass').length,
    waitCount: rows.filter((r) => r.outcome === 'wait').length,
    failCount: rows.filter((r) => r.outcome === 'fail').length,
  };
}

/** The word a candidacy carries once a decision is announced. */
function statusFor(config: SelectionConfig, call: SelectionCall): CandidateStatus {
  if (call === 'wait') return 'Waitlisted';
  if (call === 'fail') return 'Not selected';
  return config.outputKind === 'cohort' ? 'Selected' : 'Shortlisted';
}

/** Pushes the published decision onto every candidate's own status. */
async function writeStatuses(blockId: string): Promise<void> {
  const view = await selectionView(blockId);
  if (!view) return;
  await repo.setCandidateStatuses(
    view.rows
      .filter((r) => r.candidate.status !== 'Withdrawn')
      .map((r) => ({ id: r.candidate.id, status: statusFor(view.config, r.outcome) })),
  );
}

/**
 * Annoncer une audience, parce que lui écrire, c'est l'annoncer.
 *
 * Sending the letter is the announcement — there is no second, realer one, and
 * a button pressed beforehand to say "I mean it" only looked like work. So the
 * send settles exactly the people it names: their decision is written down as
 * it stood when it left, their own status takes the word, and the rest of the
 * list is untouched. Which is the whole point of telling one audience at a
 * time: nothing about the refusals is settled on the morning you write to the
 * ones you kept.
 */
export async function announceAudience(blockId: string, call: SelectionCall): Promise<void> {
  const view = await selectionView(blockId);
  if (!view) return;
  const mine = view.rows.filter((row) => row.outcome === call);
  if (!mine.length) return;

  for (const row of mine) await repo.setOutcome(blockId, row.candidate.id, call, row.overridden);
  await repo.setCandidateStatuses(
    mine
      // A startup that withdrew keeps that word, whatever a committee decided.
      .filter((r) => r.candidate.status !== 'Withdrawn')
      .map((r) => ({ id: r.candidate.id, status: statusFor(view.config, call) })),
  );
  /* The first letter out is the moment this selection stopped being a draft.
     What reads it: the committee naming its intake, the sourcing counting what
     a channel brought in, and the badge saying a row joined since. */
  if (!view.config.publishedAt) {
    await repo.updateBlock(blockId, { config: { publishedAt: new Date().toISOString() } });
  }
}

/**
 * Settling the whole list at once, for a selection nobody is written to.
 *
 * An internal cut — a shortlist that only feeds the next phase — has no letter
 * to carry it, and its startups would otherwise never take the word. Run it
 * again whenever a late score or a new arrival has left the recorded decision
 * out of line.
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
  outcome: SelectionCall,
): Promise<SelectionView | null> {
  const view = await selectionView(blockId);
  if (!view) return null;
  const row = view.rows.find((r) => r.candidate.id === candidateId);
  if (!row) return view;

  await repo.setOutcome(blockId, candidateId, outcome, outcome !== row.computed);

  if (view.published && row.candidate.status !== 'Withdrawn') {
    await repo.setCandidateStatuses([{ id: candidateId, status: statusFor(view.config, outcome) }]);
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
      const passed = await passSetOf(track, block, candidates);
      steps.push({ blockId: block.id, name: block.name, type: block.type, count: passed.size });
    }
  }
  return steps;
}


/**
 * Combien de startups chaque brique tient, en ce moment.
 *
 * Read by every work screen to decide which block to open on. The rule they
 * all want is the same — the furthest one down the funnel that still has
 * somebody in it — and without this each would have had to guess from the
 * dates, which is how you land on a block that is live and empty while the
 * work is two steps back.
 *
 * A committee counts the startups actually seated rather than the ones it
 * could seat: an empty panel is nothing to open onto.
 */
export async function populationsFor(editionId: string, trackId: string): Promise<Record<string, number>> {
  const detail = await repo.getEditionDetail(editionId);
  const track = detail?.tracks.find((t) => t.id === trackId);
  if (!track) return {};
  const everyone = (await repo.listCandidates(editionId, trackId)).filter((c) => c.status !== 'Withdrawn');

  const out: Record<string, number> = {};
  for (const block of orderedBlocks(track)) {
    if (block.type === 'application') {
      out[block.id] = everyone.length;
    } else if (block.type === 'selection') {
      out[block.id] = (await passSetOf(track, block, everyone)).size;
    } else if (block.type === 'committee') {
      out[block.id] = (await repo.listAssignments(block.id)).length;
    } else if (block.type === 'evaluation') {
      // An evaluation is worked through its committee's sittings, so what it
      // holds is what that committee seated.
      const panel = committeeForEvaluation(track, block.id);
      out[block.id] = panel ? (await repo.listAssignments(panel.id)).length : (await intakeFor(track, block.id, everyone)).length;
    } else {
      out[block.id] = (await intakeFor(track, block.id, everyone)).length;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Who stands at one step of the funnel, and under which word          */
/* ------------------------------------------------------------------ */

export interface RosterRow {
  candidate: Candidate;
  /** The word this candidate carries here, and which block gave it. */
  status: { label: string; tone: 'ok' | 'warn' | 'stop' | 'neutral'; from: string; blockId: string } | null;
  /**
   * The block whose words apply at this step, given or not. A startup nobody
   * has judged yet still stands somewhere that has a vocabulary, and the screen
   * has to be able to offer it — reading `status` alone made the list of
   * statuses vanish for exactly the candidates that needed one.
   */
  decidesAt: { id: string; name: string } | null;
}

/**
 * A funnel step, opened.
 *
 * The population is who stands there: everyone for an intake, the ones who pass
 * for a selection. The word beside each of them is the verdict of the work done
 * **on that population** — the internal review for the 440, the jury's grid for
 * the 54 — and, while that work has not happened yet, the word that got them
 * there.
 *
 * So one startup reads *Very interesting* at one step and *Pitch* at the next.
 * That is the funnel doing its job, not two vocabularies disagreeing.
 */
export async function rosterAt(editionId: string, trackId: string, blockId: string): Promise<RosterRow[]> {
  const detail = await repo.getEditionDetail(editionId);
  const track = detail?.tracks.find((t) => t.id === trackId);
  if (!track) return [];

  const ordered = orderedBlocks(track);
  const index = ordered.findIndex((b) => b.id === blockId);
  if (index === -1) return [];
  const step = ordered[index];

  const all = await repo.listCandidates(editionId, trackId);
  const everyone = all.filter((c) => c.status !== 'Withdrawn');
  /* A withdrawal is a word a candidacy wears, not an un-application: they did
     apply, and the intake has to be able to find them again — which is what
     makes a withdrawal reversible. So the first step counts everybody, and
     every step after it counts the ones still running. Filtering them out of
     the intake as well left the funnel saying 440 and the list under it 436. */
  let population = step.type === 'application' ? all : everyone;
  let carried: RosterRow['status'] | null = null;

  if (step.type === 'selection') {
    const passed = await passSetOf(track, step, everyone);
    population = everyone.filter((c) => passed.has(c.id));
    // What a selection hands out is a word of its own, which they wear until
    // the next block gives them another.
    carried = { label: (step.config as SelectionConfig).passLabel, tone: 'ok', from: step.name, blockId: step.id };
  }

  // The blocks that act on this population: everything up to the next funnel
  // step, which is where the population changes again.
  const until = ordered.findIndex((b, i) => i > index && (b.type === 'selection' || b.type === 'application'));
  const acting = ordered.slice(index + 1, until === -1 ? ordered.length : until);

  const verdicts = new Map<string, RosterRow['status']>();
  let decidesAt: RosterRow['decidesAt'] = null;
  for (const block of acting) {
    if (block.type !== 'evaluation' && block.type !== 'committee') continue;
    const outcomes = outcomesOf(block);
    if (!outcomes.length) continue;
    // The last one wins, the same way its word does below.
    decidesAt = { id: block.id, name: block.name };
    const given = await outcomesByCandidate(block);
    for (const [candidateId, entry] of given) {
      const found = entry.outcomeId ? outcomes.find((o) => o.id === entry.outcomeId) : null;
      // A later block's word replaces an earlier one's, in reading order.
      if (found) verdicts.set(candidateId, { label: found.label, tone: found.tone, from: block.name, blockId: block.id });
    }
  }

  return population.map((candidate) => ({
    candidate,
    // Withdrawn beats whatever a block said before they left: the last word on
    // a candidacy that is out is that it is out.
    status:
      candidate.status === 'Withdrawn'
        ? { label: 'Withdrawn', tone: 'neutral' as const, from: '', blockId: '' }
        : (verdicts.get(candidate.id) ?? carried),
    decidesAt,
  }));
}
