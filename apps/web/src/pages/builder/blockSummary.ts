import {
  BRICK_STATUS_LABEL,
  BRICK_STATUS_TONE,
  blockStatus,
  orderedBlocks,
  type BrickStatus,
  type TrackWithPhases,
} from '@ceed/shared';
import type {
  ApplicationConfig,
  Block,
  CommitteeConfig,
  EvaluationConfig,
  SelectionConfig,
  SourcingConfig,
} from '@ceed/shared';
import { todayIso } from '../../lib/format';

/**
 * The word a brick wears on the canvas. Read at a glance down a phase: what is
 * still taking input, what is merely shut, and what somebody has called done —
 * which is how a form nobody remembered to close makes itself visible.
 */
const statusChip = (status: BrickStatus) => ({
  label: BRICK_STATUS_LABEL[status],
  tone: BRICK_STATUS_TONE[status] as 'ok' | 'info' | 'warn' | '',
});

export type Progress = 'Completed' | 'In progress' | 'Upcoming' | null;

/** Where something sits against today. Derived from its own dates — nothing is stored. */
export function progressOf(startsOn: string | null, endsOn: string | null): Progress {
  const today = todayIso();
  if (!startsOn && !endsOn) return null;
  if (endsOn && endsOn < today) return 'Completed';
  if (startsOn && startsOn > today) return 'Upcoming';
  return 'In progress';
}

export const PROGRESS_TONE: Record<Exclude<Progress, null>, string> = {
  Completed: 'badge',
  'In progress': 'badge info',
  Upcoming: 'badge',
};

export interface BlockLine {
  /** The sentence under the block name. */
  description: string;
  /** The date shown on the right, before the status. */
  date: string | null;
  progress: Progress;
  chips: { label: string; tone: 'ok' | 'info' | 'warn' | 'cohort' | '' }[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The committee an evaluation scores, resolved the way the server resolves it:
 * the one named, or the one sharing its phase.
 */
function committeeBehind(block: Block, track?: TrackWithPhases): Block | null {
  if (!track) return null;
  const c = block.config as EvaluationConfig;
  if (c.scopeBlockId === 'standalone') return null;
  const all = orderedBlocks(track).filter((b) => b.type === 'committee');
  const phase = track.phases.find((p) => p.blocks.some((b) => b.id === block.id));
  return (
    (c.scopeBlockId ? all.find((b) => b.id === c.scopeBlockId) : phase?.blocks.find((b) => b.type === 'committee')) ??
    null
  );
}

export function blockLine(block: Block, track?: TrackWithPhases): BlockLine {
  const chips: BlockLine['chips'] = [];

  switch (block.type) {
    case 'sourcing': {
      const c = block.config as SourcingConfig;
      const filters = c.audience.roles.length + c.audience.tags.length + c.audience.recordIds.length;
      const bits = ['Send the call out and track where candidates come from'];
      if (c.channels.length) bits.push(plural(c.channels.length, 'channel'));
      if (filters) bits.push('an audience from the directory');
      // A call has no dates of its own: the form is what opens and closes.
      return { description: bits.join(' · '), date: null, progress: null, chips };
    }
    case 'application': {
      const c = block.config as ApplicationConfig;
      chips.push(statusChip(blockStatus(block)));
      return {
        description: `Collect applications through a form · ${
          c.fields.length ? plural(c.fields.length, 'question') : 'no question yet'
        }`,
        date: c.opensAt,
        progress: null,
        chips,
      };
    }
    case 'evaluation': {
      const c = block.config as EvaluationConfig;
      // A verdict block marks nothing — the panel names the status itself, so
      // saying "grid" here would describe the wrong act.
      const bits =
        c.method === 'verdict'
          ? [`The panel names one of ${c.outcomes.length} statuses`]
          : ['Score candidates against a grid'];
      if (c.method === 'score' && c.criteria.length) bits.push(`${c.criteria.length} criteria`);
      const status = blockStatus(block);
      chips.push(statusChip(status));
      // An evaluation is only reachable through its committee's panel. Open
      // while that panel is shut, it reaches nobody — and nothing else on this
      // card would say so.
      const behind = committeeBehind(block, track);
      if (status === 'live' && behind && blockStatus(behind, 'main', behind.sittings ?? 0) !== 'live') {
        chips.push({ label: 'No juror reaches it', tone: 'warn' as const });
      }
      return { description: bits.join(' · '), date: c.opensAt, progress: null, chips };
    }
    case 'committee': {
      const c = block.config as CommitteeConfig;
      const sittings = block.sittings ?? 0;
      // The sittings are the thing: a card that does not name them leaves you
      // wondering why a jury day planned for the 28th says nothing about it.
      const bits = [sittings ? plural(sittings, 'sitting') : 'No sitting yet'];
      if (c.rsvpMode === 'slots') bits.push('startups pick their time');
      else if (c.rsvpMode === 'confirm') bits.push('startups confirm');
      chips.push(statusChip(blockStatus(block, 'main', sittings)));
      return { description: bits.join(' · '), date: block.nextSittingOn ?? null, progress: null, chips };
    }
    case 'selection': {
      const c = block.config as SelectionConfig;
      if (c.outputKind === 'cohort') chips.push({ label: '◎ Forms the cohort', tone: 'cohort' });
      const method =
        c.passOutcomeIds.length
          ? `${c.passOutcomeIds.length} status${c.passOutcomeIds.length === 1 ? '' : 'es'} move on`
          : 'no status moves on yet';
      return {
        description: `Outputs ${c.outputKind === 'cohort' ? 'the selected cohort' : 'a shortlist'} · ${method}`,
        date: c.publishedAt ? c.publishedAt.slice(0, 10) : null,
        progress: c.publishedAt ? 'Completed' : null,
        chips: c.publishedAt ? chips : [...chips, { label: 'Not published', tone: 'warn' as const }],
      };
    }
    default:
      return { description: 'Not built yet', date: null, progress: null, chips };
  }
}
