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
import { launchNotice, sendDueNotices } from '../src/services/notices.js';
import { SELECTION_KINDS, selectionAudiences, selectionRoster } from '../src/services/selectionNotices.js';
import { letters } from '../src/services/mail.js';
import { createAccount } from '../src/services/auth.js';
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
      const email = `${orgName.split(' ')[0]!.toLowerCase()}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@example.test`;
      const person = await dir.createRecord({ kind: 'person', name: `${orgName} F`, email, origin: 'manual' });
      await createAccount({ email, password: 'given-by-ceed', recordId: person.id, mustChangePassword: true });
      const c = await repo.createCandidate({
        editionId: edition.id, trackId: track.id, orgId: org.id, personId: person.id,
      });
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

describe('telling each audience what was decided', { skip: skipWithoutServer }, () => {
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
    const scored = (await repo.getBlock(jury.id))!;

    const candidacy = async (orgName: string, outcome: string) => {
      const org = await dir.createRecord({ kind: 'org', name: orgName, origin: 'manual' });
      const email = `${orgName.split(' ')[0]!.toLowerCase()}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@example.test`;
      const person = await dir.createRecord({ kind: 'person', name: `${orgName} F`, email, origin: 'manual' });
      await createAccount({ email, password: 'given-by-ceed', recordId: person.id, mustChangePassword: true });
      const c = await repo.createCandidate({
        editionId: edition.id, trackId: track.id, orgId: org.id, personId: person.id,
      });
      await setOutcomeByHand(scored, c.id, outcome);
      return c;
    };
    const kept = await candidacy('Rafid Tech', 'yes');
    const held = await candidacy('Nakhla Bio', 'maybe');
    const out = await candidacy('Atlas Mobility', 'no');
    return { pick, kept, held, out };
  };

  const BODY = 'Bonjour {{startup}}, {{decision}} à l’issue de {{phase}}.';

  it('refuses to write about a decision nobody announced', async () => {
    /* Announcing is what records it. A letter about a decision the platform
       cannot show them is a letter they cannot check. */
    const { pick, kept } = await setUp();
    await launchNotice(pick.id, { kind: SELECTION_KINDS.pass, body: BODY });
    await sendDueNotices();
    assert.equal(await lettersFor(kept.id), 0);
    // This block's own notice, not the tick's total: the sender is global.
    assert.equal(
      (await repo.listNotices(pick.id))[0]!.state,
      'planned',
      'waited rather than abandoned — announcing later is an ordinary order',
    );
  });

  it('writes to one audience and leaves the others untouched', async () => {
    const { pick, kept, held, out } = await setUp();
    await publishSelection(pick.id);
    await launchNotice(pick.id, { kind: SELECTION_KINDS.pass, body: BODY });
    await sendDueNotices();

    assert.equal(await lettersFor(kept.id), 1);
    assert.equal(await lettersFor(held.id), 0, 'the waiting list hears nothing yet');
    assert.equal(await lettersFor(out.id), 0, 'and neither do the refused');
  });

  it('fills the letter with this block’s own words', async () => {
    const { pick, kept } = await setUp();
    await publishSelection(pick.id);
    await launchNotice(pick.id, { kind: SELECTION_KINDS.pass, body: BODY });
    await sendDueNotices();
    const [letter] = await letters({ candidateId: kept.id });
    assert.match(letter!.body, /Rafid Tech/);
    assert.match(letter!.body, /Shortlisted/, 'the label this selection hands out');
    assert.match(letter!.body, /Comité/, 'and the step it is');
    assert.ok(!letter!.body.includes('{{'), 'and nothing left unfilled');
  });

  it('says it again to nobody, however many times the button is pressed', async () => {
    const { pick, kept } = await setUp();
    await publishSelection(pick.id);
    for (let i = 0; i < 3; i++) {
      await launchNotice(pick.id, { kind: SELECTION_KINDS.pass, body: BODY });
      await sendDueNotices();
    }
    assert.equal(await lettersFor(kept.id), 1);
  });

  it('counts what is left to say, per audience', async () => {
    const { pick } = await setUp();
    await publishSelection(pick.id);
    await launchNotice(pick.id, { kind: SELECTION_KINDS.pass, body: BODY });
    await sendDueNotices();

    const { audiences } = await selectionAudiences(pick.id);
    const by = new Map(audiences.map((x) => [x.call, x]));
    assert.equal(by.get('pass')?.told, 1);
    assert.equal(by.get('pass')?.reachable, 0, 'nothing left to press');
    assert.equal(by.get('wait')?.told, 0);
    assert.equal(by.get('wait')?.reachable, 1);
    assert.equal(by.get('fail')?.told, 0);
  });

  it('does not write to a startup the committee moved between the launch and the send', async () => {
    /* The one mistake this whole mechanism exists to prevent: telling somebody
       they are refused the morning after they were fished out. */
    const { pick, out } = await setUp();
    await publishSelection(pick.id);
    await launchNotice(pick.id, { kind: SELECTION_KINDS.fail, scheduledFor: '2020-01-01', body: BODY });
    await overrideOutcome(pick.id, out.id, 'pass');
    await sendDueNotices();
    assert.equal(await lettersFor(out.id), 0);
  });

  it('names a startup told one thing whose decision has moved since', async () => {
    const { pick, out } = await setUp();
    await publishSelection(pick.id);
    await launchNotice(pick.id, { kind: SELECTION_KINDS.fail, body: BODY });
    await sendDueNotices();
    assert.equal(await lettersFor(out.id), 1);

    await overrideOutcome(pick.id, out.id, 'pass');
    const { contradicted } = await selectionAudiences(pick.id);
    assert.equal(contradicted.length, 1);
    assert.equal(contradicted[0]!.orgName, 'Atlas Mobility');
    assert.equal(contradicted[0]!.told, 'Not selected');
    assert.equal(contradicted[0]!.now, 'Shortlisted');
  });

  it('finds one by name even once it has been written to', async () => {
    const { pick, kept } = await setUp();
    await publishSelection(pick.id);
    await launchNotice(pick.id, { kind: SELECTION_KINDS.pass, body: BODY });
    await sendDueNotices();
    assert.equal((await selectionRoster(pick.id, SELECTION_KINDS.pass)).length, 0, 'the list has nobody left');
    assert.equal((await selectionRoster(pick.id, SELECTION_KINDS.pass, kept.id)).length, 1, 'naming it finds it');

    await launchNotice(pick.id, { kind: SELECTION_KINDS.pass, body: BODY, only: kept.id });
    await sendDueNotices();
    assert.equal(await lettersFor(kept.id), 2);
  });
});

/** How many letters this candidacy has had, whatever they said. */
async function lettersFor(candidateId: string): Promise<number> {
  return (await letters({ candidateId })).length;
}
