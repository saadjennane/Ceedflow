/**
 * The rules the team agreed on, written down where they can be broken.
 *
 * Each of these came out of a conversation and then went into a function.
 * Without a test, the only thing holding them is that nobody has edited that
 * function since — and the screen would go on looking reasonable either way.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { blockAtWork, blockStatus, parseBlockConfig, type Block, type BlockType } from '@ceed/shared';

const TODAY = '2026-09-21';

/* Configurations go through the schema, the way they do everywhere else: a
   raw object is not what any of this code ever receives. */
const block = (type: BlockType, config: Record<string, unknown>, extra: Partial<Block> = {}) =>
  ({
    id: 'b', phaseId: 'p', type, name: type, position: 0,
    config: parseBlockConfig(type, config),
    ...extra,
  }) as unknown as Block;

const form = (config: Record<string, unknown> = {}) =>
  block('application', {
    fields: [{ id: 'q', type: 'short_text', label: 'Q' }],
    ...config,
  });

describe('what a brick is doing', () => {
  it('is not configured until it holds something', () => {
    assert.equal(blockStatus(block('application', {}), 'main', 0, TODAY), 'not_configured');
  });

  it('is scheduled once it has what it needs and its day has not come', () => {
    assert.equal(blockStatus(form({ opensAt: '2026-12-01' }), 'main', 0, TODAY), 'scheduled');
  });

  it('is live between its dates', () => {
    assert.equal(blockStatus(form({ opensAt: '2026-09-01', closesAt: '2026-12-31' }), 'main', 0, TODAY), 'live');
  });

  it('is closed once the last date is past', () => {
    assert.equal(blockStatus(form({ opensAt: '2026-06-01', closesAt: '2026-08-31' }), 'main', 0, TODAY), 'closed');
  });

  it('obeys the switch over the dates, in both directions', () => {
    const dates = { opensAt: '2026-09-01', closesAt: '2026-12-31' };
    assert.equal(blockStatus(form({ ...dates, visibility: 'closed' }), 'main', 0, TODAY), 'closed');
    assert.equal(blockStatus(form({ opensAt: '2026-12-01', visibility: 'open' }), 'main', 0, TODAY), 'live');
  });

  it('remembers having been open: shut again is Closed, not Scheduled', () => {
    /* Reported from use — an evaluation opened by hand and then shut went back
       to Scheduled, as though the round had never happened. Two paths reach
       the same place: the switch says closed, or it is back on the dates and
       the brick carries the day it first opened. */
    assert.equal(blockStatus(form({ visibility: 'closed' }), 'main', 0, TODAY), 'closed');
    assert.equal(blockStatus(form({ openedAt: '2026-09-10' }), 'main', 0, TODAY), 'closed');
    // Never opened, no dates: still waiting, not over.
    assert.equal(blockStatus(form(), 'main', 0, TODAY), 'scheduled');
  });

  it('counts a sitting as the date a committee opens on', () => {
    const jury = block('committee', {}, { sittings: 1, nextSittingOn: '2026-10-28' });
    // A jury day planned for the 28th is scheduled, not an empty committee.
    assert.equal(blockStatus(jury, 'main', 1, TODAY), 'scheduled');
    const empty = block('committee', {}, { sittings: 0, nextSittingOn: null });
    assert.equal(blockStatus(empty, 'main', 0, TODAY), 'not_configured');
  });
});

describe('which brick a work screen opens on', () => {
  it('opens where the work is, not on whichever comes first', () => {
    const done = form({ opensAt: '2026-06-01', closesAt: '2026-08-31' });
    const soon = block('committee', {}, { sittings: 1, nextSittingOn: '2026-10-28' });
    const now = form({ opensAt: '2026-09-01', closesAt: '2026-12-31' });

    assert.equal(blockAtWork([done, soon], TODAY), soon, 'what is coming beats what is over');
    assert.equal(blockAtWork([done, soon, now], TODAY), now, 'what is happening beats what is coming');
    assert.equal(blockAtWork([block('application', {}), done], TODAY), done, 'something done beats nothing at all');
  });

  it('keeps reading order when two bricks are in the same state', () => {
    const a = form({ opensAt: '2026-09-01', closesAt: '2026-12-31' });
    const b = form({ opensAt: '2026-09-02', closesAt: '2026-12-31' });
    assert.equal(blockAtWork([a, b], TODAY), a);
  });

  it('has nothing to open when there is nothing', () => {
    assert.equal(blockAtWork([], TODAY), null);
  });
});
