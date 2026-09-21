import {
  applyLink,
  blockStatus,
  orderedBlocks,
  type ApplicationConfig,
  type Block,
  type DirectoryRecord,
  type SelectionConfig,
  type SourcingAudience,
  type SourcingConfig,
  type TrackWithPhases,
} from '@ceed/shared';
import * as dir from '../db/directory.js';
import * as repo from '../db/repo.js';

/** One person or organisation the call would be written to. */
export interface Prospect {
  id: string;
  name: string;
  kind: string;
  email: string;
  roles: string[];
}

/** What one channel brought in, from the link to the cohort. */
export interface ChannelResult {
  id: string;
  label: string;
  /** Null for a channel nothing was ever mailed through. */
  written: number | null;
  applied: number;
  retained: number;
  link: string;
}

export interface OutreachView {
  block: Block;
  config: SourcingConfig;
  /** The form this call points at, and whether it is actually open. */
  form: { blockId: string; token: string; published: boolean } | null;
  audience: Prospect[];
  /** Everyone the filter caught who has no email — they cannot be written to. */
  unreachable: number;
  channels: ChannelResult[];
  sends: { id: string; subject: string; recipients: string[]; sentAt: string; channelId: string | null }[];
}

/** A record answers the filter when it carries one of its roles or tags. */
function matches(record: DirectoryRecord, audience: SourcingAudience): boolean {
  if (audience.recordIds.includes(record.id)) return true;
  if (!audience.roles.length && !audience.tags.length) return false;
  const roles = record.roles ?? [];
  const tags = record.tags ?? [];
  return (
    audience.roles.some((role) => roles.includes(role)) || audience.tags.some((tag) => tags.includes(tag))
  );
}

/** Who the call would reach, asked of the directory rather than typed out. */
export async function resolveAudience(audience: SourcingAudience): Promise<DirectoryRecord[]> {
  if (!audience.roles.length && !audience.tags.length && !audience.recordIds.length) return [];
  const everyone = await dir.listRecords();
  return everyone.filter((record) => matches(record, audience));
}

/** The application this sourcing opens: the first form after it in the track. */
function formFor(track: TrackWithPhases, blockId: string): Block | null {
  const ordered = orderedBlocks(track);
  const index = ordered.findIndex((b) => b.id === blockId);
  return ordered.slice(index === -1 ? 0 : index).find((b) => b.type === 'application') ?? null;
}

export async function outreachView(blockId: string): Promise<OutreachView | null> {
  const context = await repo.blockContext(blockId);
  if (!context || context.block.type !== 'sourcing') return null;
  const detail = await repo.getEditionDetail(context.editionId);
  const track = detail?.tracks.find((t) => t.phases.some((p) => p.blocks.some((b) => b.id === blockId)));
  if (!track) return null;

  const block = context.block;
  const config = block.config as SourcingConfig;

  const form = formFor(track, blockId);
  const formConfig = form ? (form.config as ApplicationConfig) : null;

  const records = await resolveAudience(config.audience);
  const withEmail = records.filter((r) => r.email.trim());

  /* ---- What each channel brought in ---- */
  const candidates = await repo.listCandidates(context.editionId, track.id);
  const sends = await repo.listSends(blockId);

  // Who has been selected anywhere in this track, so a channel can be judged on
  // more than raw volume.
  const retained = new Set<string>();
  for (const selection of orderedBlocks(track).filter((b) => b.type === 'selection')) {
    if (!(selection.config as SelectionConfig).publishedAt) continue;
    for (const outcome of await repo.listOutcomes(selection.id)) {
      if (outcome.outcome === 'pass') retained.add(outcome.candidateId);
      else retained.delete(outcome.candidateId);
    }
  }

  const known = new Map(config.channels.map((c) => [c.id, c.label]));
  const countFor = (test: (source: string) => boolean) => {
    const matched = candidates.filter((c) => test(c.source ?? ''));
    return { applied: matched.length, retained: matched.filter((c) => retained.has(c.id)).length };
  };

  const channels: ChannelResult[] = config.channels.map((channel) => {
    const written = sends.filter((s) => s.channelId === channel.id).flatMap((s) => s.recipients);
    return {
      id: channel.id,
      label: channel.label,
      written: written.length ? new Set(written).size : null,
      ...countFor((source) => source === channel.id || source === channel.label),
      link: formConfig ? applyLink(formConfig.publicToken, channel.id) : '',
    };
  });

  // Everyone who arrived without a channel we know: direct, word of mouth, or a
  // link that lost its tag on the way.
  const other = countFor((source) => !source || (!known.has(source) && !config.channels.some((c) => c.label === source)));
  if (other.applied) {
    channels.push({ id: '', label: 'Direct or unknown', written: null, ...other, link: '' });
  }

  return {
    block,
    config,
    form: form && formConfig ? { blockId: form.id, token: formConfig.publicToken, published: blockStatus(form) === 'live' } : null,
    audience: withEmail.map((r) => ({ id: r.id, name: r.name, kind: r.kind, email: r.email, roles: r.roles ?? [] })),
    unreachable: records.length - withEmail.length,
    channels,
    sends,
  };
}
