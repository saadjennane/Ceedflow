/**
 * What a committee card says about itself.
 *
 * Both numbers come from one query against a jsonb column, unnested and
 * counted distinct. That is precisely the kind of SQL PGlite forgives and a
 * server does not, so these run against a server or they say they were
 * skipped.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { committeeView } from '../src/services/committee.js';
import { rosterAt } from '../src/services/selection.js';
import { closeDb, skipWithoutServer } from './helpers.js';

// One connection for the file: an `after` inside a describe closes it as
// soon as that describe ends, and the ones after it find nothing open.
before(migrate);
after(closeDb);

describe('counting a committee', { skip: skipWithoutServer }, () => {
  it('counts each juror once, however many sittings they sit on', async () => {
    // The jury is jsonb, so the count unnests it — the kind of query PGlite
    // forgives and a server does not, which is why this runs against one.
    const program = await repo.createProgram({ name: 'The Builders' });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const detail = await repo.getEditionDetail(edition.id);
    const phase = detail!.tracks[0].phases[0];
    const committee = await repo.createBlock(phase.id, 'committee', 'Jury Day');

    const sitting = (name: string, jury: string[]) =>
      repo.createSession(committee.id, {
        name, heldOn: '2026-10-28',
        windows: [{ startsAt: '09:00', endsAt: '12:30' }], minutesPerStartup: 25, jury,
      });
    await sitting('Morning', ['rec_a', 'rec_b', 'rec_c']);
    // rec_a judges twice; that is one person, not two.
    await sitting('Afternoon', ['rec_a', 'rec_d']);

    const again = await repo.getEditionDetail(edition.id);
    const card = again!.tracks[0].phases[0].blocks.find((b) => b.id === committee.id)!;
    assert.equal(card.sittings, 2, 'two sittings');
    assert.equal(card.jurors, 4, 'four people, five seats');
  });

  it('says nobody rather than nothing when a sitting has no jury', async () => {
    const program = await repo.createProgram({ name: 'Empty' });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const detail = await repo.getEditionDetail(edition.id);
    const phase = detail!.tracks[0].phases[0];
    const committee = await repo.createBlock(phase.id, 'committee', 'Jury Day');
    await repo.createSession(committee.id, {
      name: 'Morning', heldOn: '2026-10-28',
      windows: [{ startsAt: '09:00', endsAt: '12:30' }], minutesPerStartup: 25, jury: [],
    });

    const again = await repo.getEditionDetail(edition.id);
    const card = again!.tracks[0].phases[0].blocks.find((b) => b.id === committee.id)!;
    assert.equal(card.sittings, 1, 'the sitting still counts');
    assert.equal(card.jurors, 0, 'and nobody is on it');
  });
});

describe('a startup that withdraws', { skip: skipWithoutServer }, () => {
  /** One sitting, two startups seated on it, times handed out. */
  const setUp = async () => {
    const program = await repo.createProgram({ name: 'The Builders' });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const detail = await repo.getEditionDetail(edition.id);
    const track = detail!.tracks[0];
    const phase = track.phases[0];
    const committee = await repo.createBlock(phase.id, 'committee', 'Jury Day');
    await repo.updateBlock(committee.id, { config: { visibility: 'open', assign: true } });
    const sitting = await repo.createSession(committee.id, {
      name: 'Morning', heldOn: '2026-10-28',
      windows: [{ startsAt: '09:00', endsAt: '12:30' }], minutesPerStartup: 25, jury: ['rec_juror'],
    });
    const candidacy = async (orgName: string) => {
      const org = await dir.createRecord({ kind: 'org', name: orgName, origin: 'manual' });
      return repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id });
    };
    const leaving = await candidacy('Rafid Tech');
    const staying = await candidacy('Nakhla Bio');
    await repo.assignToSession(sitting.id, [leaving.id, staying.id]);
    // Give the one that will withdraw a time, so we can watch it come back.
    const rows = await repo.listSessionAssignments(sitting.id);
    const seat = rows.find((r) => r.candidateId === leaving.id)!;
    await repo.moveAssignmentToSlot(seat.id, 0);
    return { committee, sitting, leaving, staying };
  };

  const onSitting = async (committeeId: string) => {
    const view = await committeeView(committeeId);
    return (view!.sessions[0].assignments ?? []).map((r) => r.candidate.orgName);
  };

  it('leaves the sitting it had been put on', async () => {
    const { committee, leaving } = await setUp();
    assert.deepEqual(await onSitting(committee.id), ['Rafid Tech', 'Nakhla Bio']);

    await repo.updateCandidate(leaving.id, { status: 'Withdrawn' });
    await repo.releaseSlots(leaving.id);

    // The panel is what the juror's own list and the Review table both read.
    assert.deepEqual(await onSitting(committee.id), ['Nakhla Bio'], 'still on the panel');
  });

  it('gives its time back rather than keeping a quarter of an hour empty', async () => {
    const { sitting, leaving } = await setUp();
    const before = (await repo.listSessionAssignments(sitting.id)).find((r) => r.candidateId === leaving.id)!;
    assert.equal(before.slotIndex, 0, 'it had 09:00');

    await repo.updateCandidate(leaving.id, { status: 'Withdrawn' });
    await repo.releaseSlots(leaving.id);

    const after = (await repo.listSessionAssignments(sitting.id)).find((r) => r.candidateId === leaving.id)!;
    assert.equal(after.slotIndex, null, 'the time is free for somebody else');
  });

  it('keeps its seat in the table, which is what makes it reversible', async () => {
    const { sitting, leaving } = await setUp();
    await repo.updateCandidate(leaving.id, { status: 'Withdrawn' });
    await repo.releaseSlots(leaving.id);

    const rows = await repo.listSessionAssignments(sitting.id);
    assert.ok(rows.some((r) => r.candidateId === leaving.id), 'the row survives the withdrawal');
  });

  it('comes back to its panel when it is brought back', async () => {
    const { committee, leaving } = await setUp();
    await repo.updateCandidate(leaving.id, { status: 'Withdrawn' });
    await repo.releaseSlots(leaving.id);
    assert.deepEqual(await onSitting(committee.id), ['Nakhla Bio']);

    await repo.updateCandidate(leaving.id, { status: 'Applied' });
    assert.deepEqual(await onSitting(committee.id), ['Rafid Tech', 'Nakhla Bio'], 'back where it was');
  });
});

describe('when the time it held has been given away', { skip: skipWithoutServer }, () => {
  it('comes back to the panel with no time rather than on top of somebody', async () => {
    /* This is the case that made releasing the slot at withdrawal the right
       move rather than a nicety. Keep the slot and bringing the startup back
       puts two of them at 09:00, with nothing to say which one pitches. */
    const program = await repo.createProgram({ name: 'The Builders' });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const detail = await repo.getEditionDetail(edition.id);
    const track = detail!.tracks[0];
    const committee = await repo.createBlock(track.phases[0].id, 'committee', 'Jury Day');
    await repo.updateBlock(committee.id, { config: { visibility: 'open', assign: true } });
    const sitting = await repo.createSession(committee.id, {
      name: 'Morning', heldOn: '2026-10-28',
      windows: [{ startsAt: '09:00', endsAt: '12:30' }], minutesPerStartup: 25, jury: ['rec_juror'],
    });
    const candidacy = async (orgName: string) => {
      const org = await dir.createRecord({ kind: 'org', name: orgName, origin: 'manual' });
      return repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id });
    };
    const leaving = await candidacy('Rafid Tech');
    const taker = await candidacy('Atlas Mobility');
    await repo.assignToSession(sitting.id, [leaving.id, taker.id]);

    const seatOf = async (candidateId: string) =>
      (await repo.listSessionAssignments(sitting.id)).find((r) => r.candidateId === candidateId)!;
    await repo.moveAssignmentToSlot((await seatOf(leaving.id)).id, 0);

    // It withdraws, and 09:00 goes to somebody else.
    await repo.updateCandidate(leaving.id, { status: 'Withdrawn' });
    await repo.releaseSlots(leaving.id);
    await repo.moveAssignmentToSlot((await seatOf(taker.id)).id, 0);

    // And then it is brought back.
    await repo.updateCandidate(leaving.id, { status: 'Applied' });

    assert.equal((await seatOf(taker.id)).slotIndex, 0, 'the one that took 09:00 keeps it');
    assert.equal((await seatOf(leaving.id)).slotIndex, null, 'the one coming back has no time yet');

    const view = await committeeView(committee.id);
    const rows = view!.sessions[0].assignments ?? [];
    assert.deepEqual(
      rows.map((r) => r.candidate.orgName).sort(),
      ['Atlas Mobility', 'Rafid Tech'],
      'both are on the panel',
    );
    const atNine = rows.filter((r) => r.assignment.slotIndex === 0);
    assert.equal(atNine.length, 1, 'and only one of them pitches at 09:00');
  });
});

describe('where a withdrawn candidacy is still found', { skip: skipWithoutServer }, () => {
  /* The funnel said 440 and the list under it 436: the intake was filtering
     out the four that had withdrawn, so searching for one found nothing and
     the two numbers on one screen disagreed. */
  const setUp = async () => {
    const program = await repo.createProgram({ name: 'The Builders' });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const detail = await repo.getEditionDetail(edition.id);
    const track = detail!.tracks[0];
    const phase = track.phases[0];
    const form = await repo.createBlock(phase.id, 'application', 'Formulaire');
    const committee = await repo.createBlock(phase.id, 'committee', 'Jury Day');
    await repo.updateBlock(committee.id, { config: { visibility: 'open', assign: true } });
    const candidacy = async (orgName: string) => {
      const org = await dir.createRecord({ kind: 'org', name: orgName, origin: 'manual' });
      return repo.createCandidate({
        editionId: edition.id, trackId: track.id, orgId: org.id, originBlockId: form.id,
      });
    };
    const gone = await candidacy('Rafid Tech');
    const staying = await candidacy('Nakhla Bio');
    return { edition, track, form, committee, gone, staying };
  };

  it('keeps them in the intake, with the word Withdrawn on them', async () => {
    const { edition, track, form, gone } = await setUp();
    await repo.updateCandidate(gone.id, { status: 'Withdrawn' });

    const rows = await rosterAt(edition.id, track.id, form.id);
    assert.equal(rows.length, 2, 'both applied, and both are still findable');
    const row = rows.find((r) => r.candidate.id === gone.id)!;
    assert.equal(row.status?.label, 'Withdrawn', 'said on the row rather than left blank');
  });

  it('says Withdrawn over whatever a block had said before they left', async () => {
    // Somebody shortlisted who then pulls out reads as Withdrawn, not as
    // Shortlisted: the last word on a candidacy that is out is that it is out.
    const { edition, track, form, gone } = await setUp();
    await repo.updateCandidate(gone.id, { status: 'Shortlisted' });
    await repo.updateCandidate(gone.id, { status: 'Withdrawn' });

    const rows = await rosterAt(edition.id, track.id, form.id);
    assert.equal(rows.find((r) => r.candidate.id === gone.id)!.status?.label, 'Withdrawn');
  });

  it('leaves them out of the steps after the intake', async () => {
    const { edition, track, committee, gone } = await setUp();
    await repo.updateCandidate(gone.id, { status: 'Withdrawn' });

    const rows = await rosterAt(edition.id, track.id, committee.id);
    assert.equal(rows.length, 1, 'the jury day counts the ones still running');
    assert.equal(rows[0]!.candidate.id !== gone.id, true);
  });

  it('gives them their real word back when they are brought back', async () => {
    const { edition, track, form, gone } = await setUp();
    await repo.updateCandidate(gone.id, { status: 'Withdrawn' });
    await repo.updateCandidate(gone.id, { status: 'Applied' });

    const rows = await rosterAt(edition.id, track.id, form.id);
    assert.equal(rows.find((r) => r.candidate.id === gone.id)!.status?.label, undefined);
  });
});
