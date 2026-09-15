import type {
  ApplicationConfig,
  Block,
  CommitteeConfig,
  EvaluationConfig,
  SelectionConfig,
  SourcingConfig,
} from '@ceed/shared';
import { formatDate } from '../../lib/format';

export interface BlockStatus {
  /** One line under the block name in the canvas. */
  summary: string;
  chip?: { label: string; tone: 'ok' | 'info' | 'warn' | 'stop' | '' };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function blockStatus(block: Block): BlockStatus {
  switch (block.type) {
    case 'sourcing': {
      const c = block.config as SourcingConfig;
      const bits = [c.channels.length ? plural(c.channels.length, 'channel') : 'No channel yet'];
      if (c.target) bits.push(`target ${c.target}`);
      if (c.closesAt) bits.push(`closes ${formatDate(c.closesAt)}`);
      return { summary: bits.join(' · ') };
    }
    case 'application': {
      const c = block.config as ApplicationConfig;
      const bits = [c.fields.length ? plural(c.fields.length, 'question') : 'No question yet'];
      if (c.closesAt) bits.push(`closes ${formatDate(c.closesAt)}`);
      return {
        summary: bits.join(' · '),
        chip: c.published ? { label: 'Form live', tone: 'ok' } : { label: 'Not published', tone: '' },
      };
    }
    case 'evaluation': {
      const c = block.config as EvaluationConfig;
      const bits = [c.criteria.length ? plural(c.criteria.length, 'criterion').replace('criterions', 'criteria') : 'No criteria yet'];
      if (c.evaluators.length) bits.push(plural(c.evaluators.length, 'evaluator'));
      return { summary: bits.join(' · ') };
    }
    case 'committee': {
      const c = block.config as CommitteeConfig;
      const bits = [c.heldAt ? formatDate(c.heldAt) : 'No date yet'];
      if (c.juryIds.length) bits.push(plural(c.juryIds.length, 'jury member'));
      if (c.location) bits.push(c.location);
      return { summary: bits.join(' · ') };
    }
    case 'selection': {
      const c = block.config as SelectionConfig;
      const method =
        c.method === 'threshold' ? `score ≥ ${c.threshold}` : c.method === 'top_n' ? `top ${c.topN}` : 'decided by hand';
      const kind = c.outputKind === 'cohort' ? 'Forms the cohort' : 'Shortlist';
      return {
        summary: `${kind} · ${method}`,
        chip: c.publishedAt
          ? { label: 'Published', tone: 'ok' }
          : { label: 'Not published', tone: 'warn' },
      };
    }
    default:
      return { summary: 'Not built yet' };
  }
}

/** Blocks whose drawer opens onto a working panel rather than settings only. */
export const HAS_WORKSPACE = new Set(['application', 'evaluation', 'committee', 'selection']);
