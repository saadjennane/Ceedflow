import type {
  ApplicationConfig,
  Block,
  CommitteeConfig,
  EvaluationConfig,
  SelectionConfig,
  SourcingConfig,
} from '@ceed/shared';
import { todayIso } from '../../lib/format';

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

export function blockLine(block: Block): BlockLine {
  const chips: BlockLine['chips'] = [];

  switch (block.type) {
    case 'sourcing': {
      const c = block.config as SourcingConfig;
      const emails = c.outreach.recipients.kind === 'list' ? c.outreach.recipients.emails.length : 0;
      const bits = ['Send the call out and track where candidates come from'];
      if (c.channels.length) bits.push(plural(c.channels.length, 'channel'));
      if (emails) bits.push(plural(emails, 'recipient'));
      return {
        description: bits.join(' · '),
        date: c.opensAt,
        progress: progressOf(c.opensAt, c.closesAt),
        chips,
      };
    }
    case 'application': {
      const c = block.config as ApplicationConfig;
      if (c.published) chips.push({ label: 'Form live', tone: 'ok' });
      return {
        description: `Collect applications through a form · ${
          c.fields.length ? plural(c.fields.length, 'question') : 'no question yet'
        }`,
        date: c.opensAt,
        progress: progressOf(c.opensAt, c.closesAt),
        chips,
      };
    }
    case 'evaluation': {
      const c = block.config as EvaluationConfig;
      const bits = ['Score candidates against a grid'];
      if (c.criteria.length) bits.push(`${c.criteria.length} criteria`);
      if (c.evaluators.length) bits.push(plural(c.evaluators.length, 'evaluator'));
      return {
        description: bits.join(' · '),
        date: c.opensAt,
        progress: progressOf(c.opensAt, c.closesAt),
        chips,
      };
    }
    case 'committee': {
      const c = block.config as CommitteeConfig;
      const bits = ['Run the jury sittings and score the startups'];
      if (c.criteria.length) bits.push(`${c.criteria.length} criteria`);
      if (c.rsvpMode === 'slots') bits.push('startups pick a time');
      else if (c.rsvpMode === 'confirm') bits.push('startups confirm');
      return {
        description: bits.join(' · '),
        date: c.rsvpDeadline,
        progress: null,
        chips,
      };
    }
    case 'selection': {
      const c = block.config as SelectionConfig;
      if (c.outputKind === 'cohort') chips.push({ label: '◎ Forms the cohort', tone: 'cohort' });
      const method =
        c.method === 'threshold' ? `score ≥ ${c.threshold}` : c.method === 'top_n' ? `top ${c.topN}` : 'decided by hand';
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
