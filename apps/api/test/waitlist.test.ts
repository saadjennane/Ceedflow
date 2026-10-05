/**
 * La liste d'attente : une troisième réponse, et seule la première ouvre la porte.
 *
 * A selection answered two things, and that is what forced a programme to lie.
 * A startup a committee keeps within reach was either "selected" — which it is
 * not — or "not selected", which could not be said without having to take it
 * back a week later. So it was left with no status and no word, while the
 * retained ones got theirs.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { callFor, intakeFor, overrideOutcome, publishSelection, selectionView } from '../src/services/selection.js';
import { setOutcomeByHand } from '../src/services/scoring.js';
import { closeDb, skipWithoutServer } from './helpers.js';

before(migrate);
after(closeDb);

const config = (over: Record<string, unknown> = {}) =>
  ({ passOutcomeIds: ['yes'], waitOutcomeIds: ['maybe'], ...over }) as never;

describe('the rule, before any database', () => {
  it('reads the three lists', () => {
    assert.equal(callFor(config(), 'yes'), 'pass');
    assert.equal(callFor(config(), 'maybe'), 'wait');
    assert.equal(callFor(config(), 'no'), 'fail');
  });

  it('calls a status nobody has fail, rather than nothing', () => {
    assert.equal(callFor(config(), null), 'fail');
  });

  it('lets moving on outrank waiting when a status is in both', () => {
    /* Otherwise the answer depended on which of two arrays happened to be read
       first — a rule whose result is an accident of implementation. */
    assert.equal(callFor(config({ waitOutcomeIds: ['yes', 'maybe'] }), 'yes'), 'pass');
  });

  it('is binary until somebody asks for a third answer', () => {
    assert.equal(callFor(config({ waitOutcomeIds: [] }), 'maybe'), 'fail');
  });
});

describe('a selection that holds some startups', { skip: skipWithoutServer }, () => {
  const setUp = async () => {
    const program = await repo.createProgram({ name: 'The Builders' });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const detail = await repo.getEditionDetail(edition.id);
    const track = detail!.tracks[0];
    const phase = track.phases[0];

    const jury = await repo.createBlock(phase.id, 'evaluation', 'Note du jury');
    await repo.updateBlock(jury.id, {
      config: {
        method: 'score',
        criteria: [{ id: 'c', label: 'Tout', weight: 100, children: [] }],
        outcomes: [
          { id: 'yes', label: 'Retenue', tone: 'ok', minScore: 70, whenSplit: false },
          { id: 'maybe', label: 'À revoir', tone: 'neutral', minScore: 50, whenSplit: false },
          { id: 'no', label: 'Refusée', tone: 'stop', minScore: null, whenSplit: false },
        ],
      },
    });
    const pick = await repo.createBlock(phase.id, 'selection', 'Comité');
    await repo.updateBlock(pick.id, { config: { passOutcomeIds: ['yes'], waitOutcomeIds: ['maybe'] } });
    const next = await repo.createBlock(phase.id, 'deliverable', 'Due diligence');

    const scored = (await repo.getBlock(jury.id))!;
    const candidacy = async (orgName: string, outcome: string) => {
      const org = await dir.createRecord({ kind: 'org', name: orgName, origin: 'manual' });
      const c = await repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id });
      await setOutcomeByHand(scored, c.id, outcome);
      return c;
    };
    const kept = await candidacy('Rafid Tech', 'yes');
    const held = await candidacy('Nakhla Bio', 'maybe');
    const out = await candidacy('Atlas Mobility', 'no');
    return { edition, track, pick, next, kept, held, out };
  };

  it('counts three answers where there used to be two', async () => {
    const { pick } = await setUp();
    const view = (await selectionView(pick.id))!;
    assert.equal(view.passCount, 1);
    assert.equal(view.waitCount, 1);
    assert.equal(view.failCount, 1);
  });

  it('gives a held startup its own word, not silence and not a refusal', async () => {
    const { pick, held, out } = await setUp();
    await publishSelection(pick.id);
    assert.equal((await repo.getCandidate(held.id))?.status, 'Waitlisted');
    assert.equal((await repo.getCandidate(out.id))?.status, 'Not selected');
  });

  it('keeps the door shut on it — waiting is not passing', async () => {
    const { edition, track, pick, next, kept, held } = await setUp();
    await publishSelection(pick.id);
    const detail = await repo.getEditionDetail(edition.id);
    const fresh = detail!.tracks.find((t) => t.id === track.id)!;
    const everyone = await repo.listCandidates(edition.id, track.id);

    const through = await intakeFor(fresh, next.id, everyone);
    assert.deepEqual(through.map((c) => c.id), [kept.id], 'only the one that passed');
    assert.ok(!through.some((c) => c.id === held.id));
    assert.ok(pick.id);
  });

  it('lets a repêchage move one off the list by hand, and says so downstream', async () => {
    const { edition, track, pick, next, held } = await setUp();
    await publishSelection(pick.id);
    await overrideOutcome(pick.id, held.id, 'pass');

    assert.equal((await repo.getCandidate(held.id))?.status, 'Shortlisted');
    const detail = await repo.getEditionDetail(edition.id);
    const fresh = detail!.tracks.find((t) => t.id === track.id)!;
    const everyone = await repo.listCandidates(edition.id, track.id);
    const through = await intakeFor(fresh, next.id, everyone);
    assert.equal(through.length, 2, 'the door opens for it now');
  });

  it('lets a call made by hand put one back on the list', async () => {
    const { pick, kept } = await setUp();
    await publishSelection(pick.id);
    await overrideOutcome(pick.id, kept.id, 'wait');
    assert.equal((await repo.getCandidate(kept.id))?.status, 'Waitlisted');
    const view = (await selectionView(pick.id))!;
    assert.equal(view.waitCount, 2);
    assert.equal(view.passCount, 0);
  });

  it('stays binary where nothing is held, rather than growing an empty answer', async () => {
    const { pick } = await setUp();
    await repo.updateBlock(pick.id, { config: { waitOutcomeIds: [] } });
    const view = (await selectionView(pick.id))!;
    assert.equal(view.waitCount, 0);
    assert.equal(view.failCount, 2, 'the held one falls back to refused');
  });
});
