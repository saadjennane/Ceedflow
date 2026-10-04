/**
 * What has been asked of the startups still in, and what has come back.
 *
 * One shape serves both readings the work needs. By startup: is this file
 * complete. By item: who still owes me the RIB. Those are the same matrix read
 * along its two axes, so the server sends the matrix and lets the screen turn
 * it — anything else would be two endpoints that can disagree.
 */
import { blockStatus, orderedBlocks, type Candidate, type DeliverableConfig, type FormField } from '@ceed/shared';
import * as repo from '../db/repo.js';
import { intakeFor, trackOf } from './selection.js';

export interface DeliverableReturnView {
  itemId: string;
  value: unknown;
  state: 'received' | 'accepted' | 'rejected';
  reason: string;
  returnedAt: string | null;
  reviewedAt: string | null;
}

export interface DeliverableRow {
  candidate: Candidate;
  returns: DeliverableReturnView[];
  /** Required items with something in them — arrived, whatever was made of it. */
  done: number;
  /** Required items somebody at CEED has read and passed. */
  accepted: number;
  /** Items sent back, of any kind: what the startup still has to redo. */
  rejected: number;
  required: number;
  /**
   * Every required item accepted. Not "every one arrived": a file nobody has
   * read is not a file in order, and the selection downstream reads this.
   */
  complete: boolean;
}

export interface DeliverableView {
  blockId: string;
  name: string;
  intro: string;
  items: FormField[];
  rows: DeliverableRow[];
}

const given = (value: unknown) =>
  !(value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length));

export async function deliverableView(blockId: string): Promise<DeliverableView | null> {
  const context = await repo.blockContext(blockId);
  if (!context || context.block.type !== 'deliverable') return null;
  const detail = await repo.getEditionDetail(context.editionId);
  const track = detail ? trackOf(detail.tracks, blockId) : null;
  if (!track) return null;

  const config = context.block.config as DeliverableConfig;
  // Only the startups that got this far, and not the ones that have left: a
  // list of documents owed by somebody who withdrew is a list of chasing
  // nobody should do.
  const everyone = (await repo.listCandidates(context.editionId, track.id)).filter((c) => c.status !== 'Withdrawn');
  const intake = await intakeFor(track, blockId, everyone);

  const returns = await repo.listReturns(blockId);
  const byCandidate = new Map<string, DeliverableReturnView[]>();
  for (const row of returns) {
    const list = byCandidate.get(row.candidateId) ?? [];
    list.push({
      itemId: row.itemId, value: row.value, state: row.state,
      reason: row.reason, returnedAt: row.returnedAt, reviewedAt: row.reviewedAt,
    });
    byCandidate.set(row.candidateId, list);
  }

  const required = config.items.filter((i) => i.required);

  return {
    blockId,
    name: context.block.name,
    intro: config.intro,
    items: config.items,
    rows: intake.map((candidate) => {
      const mine = byCandidate.get(candidate.id) ?? [];
      const sent = (item: { id: string }) => mine.find((r) => r.itemId === item.id && given(r.value));
      const done = required.filter((item) => sent(item)).length;
      const accepted = required.filter((item) => sent(item)?.state === 'accepted').length;
      return {
        candidate,
        returns: mine,
        done,
        accepted,
        // Every item sent back, required or not: it is work the startup owes.
        rejected: mine.filter((r) => r.state === 'rejected').length,
        required: required.length,
        // An item that was never marked required cannot hold a file open.
        complete: accepted === required.length,
      };
    }),
  };
}

/**
 * The blocks a startup still owes something to, for its own page.
 *
 * Read from the edition rather than from a list kept somewhere: a block added
 * to the phase this morning is owed from this morning, with nothing to
 * migrate.
 */
export async function deliverablesFor(
  editionId: string,
  candidate: Candidate,
): Promise<
  {
    block: { id: string; name: string };
    config: DeliverableConfig;
    /** Whether the list still takes answers. The screen reads this rather than
        working it out again, so the two cannot disagree. */
    open: boolean;
    returns: DeliverableReturnView[];
  }[]
> {
  const detail = await repo.getEditionDetail(editionId);
  const track = detail?.tracks.find((t) => t.id === candidate.trackId);
  if (!track) return [];

  const out = [];
  for (const block of orderedBlocks(track).filter((b) => b.type === 'deliverable')) {
    const intake = await intakeFor(track, block.id, [candidate]);
    if (!intake.length) continue;
    /* The door decides what a founder sees, which it did not before: a list
       was visible the moment the upstream statuses put them in the pass set,
       whether or not anybody had opened it. Shut, it stays readable — the
       startup's own record of what it handed over — but nothing more. */
    const status = blockStatus(block);
    if (status !== 'live' && status !== 'closed') continue;
    const returns = await repo.listReturnsFor(block.id, candidate.id);
    out.push({
      block: { id: block.id, name: block.name },
      config: block.config as DeliverableConfig,
      open: status === 'live',
      returns: returns.map((r) => ({
        itemId: r.itemId, value: r.value, state: r.state,
        reason: r.reason, returnedAt: r.returnedAt, reviewedAt: r.reviewedAt,
      })),
    });
  }
  return out;
}
