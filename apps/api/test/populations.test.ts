/**
 * Où un écran de travail doit s'ouvrir.
 *
 * On whichever block happens to be live, you land on an empty page while the
 * work is two steps back: a jury day set up before anybody reached it is open
 * and holds nobody. The rule every screen wants is the same — the furthest
 * block down the funnel that still has somebody in it — so the counts are
 * answered once, here.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { seatOnFreeSlots } from '../src/services/committee.js';
import { populationsFor } from '../src/services/selection.js';
import { setOutcomeByHand } from '../src/services/scoring.js';
import { closeDb, skipWithoutServer } from './helpers.js';

before(migrate);
after(closeDb);

describe('how many each block holds', { skip: skipWithoutServer }, () => {
  const setUp = async () => {
    const stamp = `${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    const program = await repo.createProgram({ name: 'The Builders' });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const detail = await repo.getEditionDetail(edition.id);
    const track = detail!.tracks[0];
    const phase = track.phases[0];

    const form = await repo.createBlock(phase.id, 'application', 'Candidature');
    const jury = await repo.createBlock(phase.id, 'evaluation', 'Note du jury');
    await repo.updateBlock(jury.id, {
      config: {
        method: 'score',
        criteria: [{ id: 'c', label: 'Tout', weight: 100, children: [] }],
        outcomes: [
          { id: 'yes', label: 'Retenue', tone: 'ok', minScore: 70, whenSplit: false },
          { id: 'no', label: 'Refusée', tone: 'stop', minScore: null, whenSplit: false },
        ],
      },
    });
    const panel = await repo.createBlock(phase.id, 'committee', 'Jury day');
    await repo.createSession(panel.id, {
      name: 'Séance 1', heldOn: '2026-10-20', minutesPerStartup: 20,
      windows: [{ startsAt: '09:00', endsAt: '12:00' }],
    });
    const pick = await repo.createBlock(phase.id, 'selection', 'Comité');
    await repo.updateBlock(pick.id, { config: { passOutcomeIds: ['yes'] } });
    const due = await repo.createBlock(phase.id, 'deliverable', 'Due diligence');

    const scored = (await repo.getBlock(jury.id))!;
    const candidacy = async (orgName: string, outcome: string) => {
      const org = await dir.createRecord({ kind: 'org', name: `${orgName} ${stamp}`, origin: 'manual' });
      const c = await repo.createCandidate({
        editionId: edition.id, trackId: track.id, orgId: org.id, originBlockId: form.id,
      });
      await setOutcomeByHand(scored, c.id, outcome);
      return c;
    };
    const kept = await candidacy('Rafid Tech', 'yes');
    const out = await candidacy('Atlas Mobility', 'no');
    return { edition, track, form, jury, panel, pick, due, kept, out };
  };

  it('counts everybody at the form and the passed ones after a selection', async () => {
    const { edition, track, form, pick, due } = await setUp();
    const held = await populationsFor(edition.id, track.id);
    assert.equal(held[form.id], 2);
    assert.equal(held[pick.id], 1, 'only the one the rule passes');
    assert.equal(held[due.id], 1, 'and the block behind it holds the same');
  });

  it('counts a committee by who is seated, not by who could be', async () => {
    /* An empty panel is nothing to open onto, however live it is — which is
       the state of every jury day the week before it happens. */
    const { edition, track, panel, kept } = await setUp();
    assert.equal((await populationsFor(edition.id, track.id))[panel.id], 0);

    const sitting = (await repo.listSessions(panel.id))[0]!;
    await seatOnFreeSlots(sitting.id, [kept.id]);
    assert.equal((await populationsFor(edition.id, track.id))[panel.id], 1);
  });

  it('gives an evaluation what its committee seated', async () => {
    const { edition, track, panel, jury, kept } = await setUp();
    const sitting = (await repo.listSessions(panel.id))[0]!;
    await seatOnFreeSlots(sitting.id, [kept.id]);
    assert.equal((await populationsFor(edition.id, track.id))[jury.id], 1);
  });

  it('leaves out a startup that withdrew', async () => {
    const { edition, track, form, kept } = await setUp();
    await repo.updateCandidate(kept.id, { status: 'Withdrawn' });
    assert.equal((await populationsFor(edition.id, track.id))[form.id], 1);
  });

  it('counts nobody behind a selection that passes nobody', async () => {
    // The case that sends a screen to an empty page: open, and holding none.
    const { edition, track, pick, due } = await setUp();
    await repo.updateBlock(pick.id, { config: { passOutcomeIds: [] } });
    const held = await populationsFor(edition.id, track.id);
    assert.equal(held[pick.id], 0);
    assert.equal(held[due.id], 0);
  });
});
