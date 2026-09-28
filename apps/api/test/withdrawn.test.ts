/**
 * What happens to a juror's marks when they leave a panel.
 *
 * Before this, taking somebody off a sitting rewrote one column and nothing
 * else: their marks kept weighing on the average, at equal strength with the
 * jury that stayed, and no screen said so. The fix is not "delete them" — a
 * jury's decisions can be contested and the record of who said what is what
 * you need that day — but "stop counting them, and say when".
 *
 * The arithmetic runs anywhere. The withdrawal itself needs a server, because
 * it is one `update ... returning` and the point is what it leaves behind.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { consensusScore, markCounts, type EvaluationScore, type ScoredCriterion } from '@ceed/shared';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { closeDb, skipWithoutServer } from './helpers.js';

const ONE_CRITERION: ScoredCriterion[] = [{ id: 'team', label: 'Team', weight: 1, max: 10 }];

/** A mark as the table stores it, with only what the average reads. */
const mark = (id: string, out: number, withdrawn: string | null = null): EvaluationScore => ({
  id,
  blockId: 'blk',
  candidateId: 'cnd',
  evaluatorId: `juror_${id}`,
  evaluatorName: '',
  marks: { team: out },
  verdict: '',
  comment: '',
  submittedAt: '2026-09-28T10:00:00Z',
  withdrawnAt: withdrawn,
});

describe('a withdrawn mark', () => {
  it('leaves the average to the jury that stayed', () => {
    // Three jurors: 8, 6, and a 2 from somebody who should not have judged.
    const all = [mark('a', 8), mark('b', 6), mark('c', 2)];
    assert.equal(consensusScore(all, ONE_CRITERION), 53.3, 'the three-juror average');

    const withoutC = [mark('a', 8), mark('b', 6), mark('c', 2, '2026-09-28T11:00:00Z')];
    assert.equal(consensusScore(withoutC, ONE_CRITERION), 70, 'the two who remain');
  });

  it('is not the same thing as an unsent one', () => {
    // Both are excluded, for different reasons — and a draft can still be sent.
    const draft = { ...mark('a', 8), submittedAt: null };
    const withdrawn = mark('b', 8, '2026-09-28T11:00:00Z');
    assert.equal(markCounts(draft), false);
    assert.equal(markCounts(withdrawn), false);
    assert.equal(markCounts(mark('c', 8)), true);
  });

  it('leaves no average at all when it was the only one', () => {
    assert.equal(consensusScore([mark('a', 8, '2026-09-28T11:00:00Z')], ONE_CRITERION), null);
  });
});

describe('withdrawing marks', { skip: skipWithoutServer }, () => {
  before(migrate);
  after(closeDb);

  /** A committee with one sitting, two jurors, one startup each has scored. */
  const setUp = async () => {
    const program = await repo.createProgram({ name: 'The Builders' });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const detail = await repo.getEditionDetail(edition.id);
    const track = detail!.tracks[0];
    const phase = track.phases[0];
    const committee = await repo.createBlock(phase.id, 'committee', 'Jury Day');
    const evaluation = await repo.createBlock(phase.id, 'evaluation', 'Marks');
    // The marks point at real candidacies: candidate_id is a foreign key, and
    // a fixture that ignores it passes locally and fails on a server.
    const candidacy = async (orgName: string) => {
      const org = await dir.createRecord({ kind: 'org', name: orgName, origin: 'manual' });
      return repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id });
    };
    const rafid = await candidacy('Rafid Tech');
    const nakhla = await candidacy('Nakhla Bio');
    const sitting = await repo.createSession(committee.id, {
      name: 'Morning panel',
      heldOn: '2026-10-28',
      windows: [{ startsAt: '09:00', endsAt: '12:30' }],
      minutesPerStartup: 25,
      jury: ['rec_stays', 'rec_leaves'],
    });
    const score = (evaluatorId: string, name: string, out: number) =>
      repo.upsertScore({
        blockId: evaluation.id,
        candidateId: rafid.id,
        evaluatorId,
        evaluatorName: name,
        sessionId: sitting.id,
        marks: { team: out },
        submit: true,
      });
    await score('rec_stays', 'Nawal Cherkaoui', 8);
    await score('rec_leaves', 'Karim Idrissi', 2);
    return { evaluation, sitting, committee, rafid, nakhla };
  };

  it('takes them out of the count without taking them off the record', async () => {
    const { evaluation, sitting } = await setUp();

    const moved = await repo.withdrawScores(sitting.id, ['rec_leaves']);
    assert.equal(moved, 1, 'one mark withdrawn');

    const rows = await repo.listScores(evaluation.id);
    assert.equal(rows.length, 2, 'both marks are still there');
    const gone = rows.find((r) => r.evaluatorId === 'rec_leaves')!;
    assert.ok(gone.withdrawnAt, 'the withdrawal carries a date');
    assert.deepEqual(gone.marks, { team: 2 }, 'and what they said is unchanged');
    assert.equal(rows.find((r) => r.evaluatorId === 'rec_stays')!.withdrawnAt, null);

    assert.equal(consensusScore(rows, ONE_CRITERION), 80, 'the average follows the jury that stayed');
  });

  it('does not withdraw the same mark twice', async () => {
    const { sitting } = await setUp();
    assert.equal(await repo.withdrawScores(sitting.id, ['rec_leaves']), 1);
    assert.equal(await repo.withdrawScores(sitting.id, ['rec_leaves']), 0, 'the second pass finds nothing left');
  });

  it('leaves the other sittings of the same juror alone', async () => {
    // Somebody sits on two panels of one committee. Leaving one is not leaving
    // the other, and a withdrawal scoped to the block would have taken both.
    const { evaluation, sitting, committee, nakhla } = await setUp();
    const other = await repo.createSession(committee.id, {
      name: 'Afternoon panel',
      heldOn: '2026-10-28',
      windows: [{ startsAt: '14:00', endsAt: '17:00' }],
      minutesPerStartup: 25,
      jury: ['rec_leaves'],
    });
    await repo.upsertScore({
      blockId: evaluation.id,
      candidateId: nakhla.id,
      evaluatorId: 'rec_leaves',
      evaluatorName: 'Karim Idrissi',
      sessionId: other.id,
      marks: { team: 9 },
      submit: true,
    });

    await repo.withdrawScores(sitting.id, ['rec_leaves']);
    const elsewhere = (await repo.listScores(evaluation.id)).find((r) => r.candidateId === nakhla.id)!;
    assert.equal(elsewhere.withdrawnAt, null, 'the afternoon panel kept its mark');
  });

  it('counts again when the same juror is put back and scores again', async () => {
    const { evaluation, sitting, rafid } = await setUp();
    await repo.withdrawScores(sitting.id, ['rec_leaves']);

    await repo.upsertScore({
      blockId: evaluation.id,
      candidateId: rafid.id,
      evaluatorId: 'rec_leaves',
      evaluatorName: 'Karim Idrissi',
      sessionId: sitting.id,
      marks: { team: 6 },
      submit: true,
    });

    const back = (await repo.listScores(evaluation.id)).find((r) => r.evaluatorId === 'rec_leaves')!;
    assert.equal(back.withdrawnAt, null, 'marking again is marking for real');
    assert.deepEqual(back.marks, { team: 6 });
  });

  it('says what a removal would cost before it is made', async () => {
    const { sitting } = await setUp();
    const per = await repo.marksPerJuror(sitting.id);
    const leaving = per.find((p) => p.evaluatorId === 'rec_leaves')!;
    assert.equal(leaving.submitted, 1);
    assert.equal(leaving.evaluatorName, 'Karim Idrissi', 'named, so the question can name them');

    await repo.withdrawScores(sitting.id, ['rec_leaves']);
    const after = await repo.marksPerJuror(sitting.id);
    assert.equal(after.find((p) => p.evaluatorId === 'rec_leaves'), undefined, 'a withdrawn mark costs nothing');
  });
});
