/**
 * What a due diligence asks of whom.
 *
 * The two rules that make the brick what it is and not a second form: only the
 * startups that got past the selection before it are asked, and an item only
 * counts as given when something is actually in it. Both run against a server,
 * because both are read out of the database in one go.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { db, migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { fillTemplate, selectionSource } from '@ceed/shared';
import {
  deliverableView,
  deliverablesFor,
  noticeRoster,
  rosterFor,
  tellReturned,
} from '../src/services/deliverables.js';
import { launchNotice, sendDueNotices, sendTest } from '../src/services/notices.js';
import { deliverableNotices } from '../src/services/deliverables.js';
import { accountOfRecord, createAccount } from '../src/services/auth.js';
import { letters, suppress } from '../src/services/mail.js';
import { outcomesByCandidate, outcomesOf, setOutcomeByHand } from '../src/services/scoring.js';
import { closeDb, skipWithoutServer } from './helpers.js';

before(migrate);
after(closeDb);

const ITEMS = [
  { id: 'rc', type: 'file', label: 'Registre de commerce', help: '', required: true, options: [], showInTable: false, pageId: '' },
  { id: 'nb', type: 'number', label: 'Effectif', help: '', required: true, options: [], showInTable: false, pageId: '' },
  { id: 'cac', type: 'short_text', label: 'Commissaire', help: '', required: false, options: [], showInTable: false, pageId: '' },
];

describe('what a deliverables block asks, and of whom', { skip: skipWithoutServer }, () => {
  const setUp = async () => {
    const program = await repo.createProgram({ name: 'The Builders' });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const detail = await repo.getEditionDetail(edition.id);
    const track = detail!.tracks[0];
    const phase = track.phases[0];
    const shortlist = await repo.createBlock(phase.id, 'selection', 'Shortlist');
    const due = await repo.createBlock(phase.id, 'deliverable', 'Due diligence');
    await repo.updateBlock(due.id, { config: { visibility: 'open', items: ITEMS } });

    const candidacy = async (orgName: string) => {
      const org = await dir.createRecord({ kind: 'org', name: orgName, origin: 'manual' });
      return repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id });
    };
    const kept = await candidacy('Rafid Tech');
    const cut = await candidacy('Atlas Mobility');
    // The shortlist keeps one of them, by hand.
    await repo.setOutcome(shortlist.id, kept.id, 'pass', true);
    return { due, kept, cut };
  };

  it('asks only the startups the selection kept', async () => {
    const { due, kept, cut } = await setUp();
    const view = (await deliverableView(due.id))!;
    assert.deepEqual(view.rows.map((r) => r.candidate.id), [kept.id], 'one of the two');
    assert.ok(!view.rows.some((r) => r.candidate.id === cut.id), 'and not the one that was cut');
  });

  it('counts a file against the required items only', async () => {
    const { due, kept } = await setUp();
    const before = (await deliverableView(due.id))!.rows[0]!;
    assert.equal(before.required, 2, 'two of the three hold the file open');
    assert.equal(before.done, 0);

    await repo.saveReturn(due.id, kept.id, 'cac', 'Cabinet Atlas');
    assert.equal((await deliverableView(due.id))!.rows[0]!.done, 0, 'an optional answer moves nothing');

    await repo.saveReturn(due.id, kept.id, 'rc', { uploadId: 'up_1', filename: 'rc.pdf' });
    await repo.saveReturn(due.id, kept.id, 'nb', 12);
    const done = (await deliverableView(due.id))!.rows[0]!;
    assert.equal(done.done, 2, 'both required ones have arrived');
  });

  it('is not complete until somebody has read it', async () => {
    /* The distinction the whole second half of this brick exists for: a file
       nobody has opened is not a file in order, and the selection downstream
       reads `complete`. */
    const { due, kept } = await setUp();
    await repo.saveReturn(due.id, kept.id, 'rc', { uploadId: 'up_1', filename: 'rc.pdf' });
    await repo.saveReturn(due.id, kept.id, 'nb', 12);
    const arrived = (await deliverableView(due.id))!.rows[0]!;
    assert.equal(arrived.done, 2, 'everything asked for is in');
    assert.equal(arrived.accepted, 0);
    assert.equal(arrived.complete, false, 'and the file is still not in order');

    await repo.reviewReturn(due.id, kept.id, 'rc', 'accepted', '');
    assert.equal((await deliverableView(due.id))!.rows[0]!.complete, false, 'one of two is not two');

    await repo.reviewReturn(due.id, kept.id, 'nb', 'accepted', '');
    const read = (await deliverableView(due.id))!.rows[0]!;
    assert.equal(read.accepted, 2);
    assert.equal(read.complete, true, 'the optional one was never in the way');
  });

  it('puts something sent back to unread when it is sent again', async () => {
    // A refusal that survived the answer to it would leave a file refused for
    // a reason that has been dealt with.
    const { due, kept } = await setUp();
    await repo.saveReturn(due.id, kept.id, 'rc', { uploadId: 'up_1', filename: 'old.pdf' });
    await repo.reviewReturn(due.id, kept.id, 'rc', 'rejected', 'Le registre date de 2024.');

    const sent = (await deliverableView(due.id))!.rows[0]!;
    assert.equal(sent.returns[0]!.state, 'rejected');
    assert.equal(sent.returns[0]!.reason, 'Le registre date de 2024.');
    assert.equal(sent.rejected, 1, 'the file says what it owes');

    await repo.saveReturn(due.id, kept.id, 'rc', { uploadId: 'up_2', filename: 'new.pdf' });
    const again = (await deliverableView(due.id))!.rows[0]!;
    assert.equal(again.returns[0]!.state, 'received', 'back to be read');
    assert.equal(again.returns[0]!.reason, '', 'and the old reason goes with it');
    assert.equal(again.rejected, 0);
  });

  it('refuses to read something nobody sent', async () => {
    // Accepting a document that does not exist would put a file in order on
    // the strength of nothing.
    const { due, kept } = await setUp();
    assert.equal(await repo.reviewReturn(due.id, kept.id, 'rc', 'accepted', ''), false);
  });

  it('takes an answer back out when it is cleared', async () => {
    // An item emptied is an item not handed in. A row left behind saying
    // "returned, with nothing in it" would count as given on every screen.
    const { due, kept } = await setUp();
    await repo.saveReturn(due.id, kept.id, 'nb', 12);
    assert.equal((await deliverableView(due.id))!.rows[0]!.done, 1);

    await repo.saveReturn(due.id, kept.id, 'nb', null);
    const after = (await deliverableView(due.id))!.rows[0]!;
    assert.equal(after.done, 0);
    assert.ok(!after.returns.some((r) => r.itemId === 'nb'), 'and nothing is left behind');
  });

  it('keeps the day it first arrived when a correction follows', async () => {
    const { due, kept } = await setUp();
    await repo.saveReturn(due.id, kept.id, 'nb', 12);
    const first = (await deliverableView(due.id))!.rows[0]!.returns[0]!.returnedAt;

    await repo.saveReturn(due.id, kept.id, 'nb', 14);
    const again = (await deliverableView(due.id))!.rows[0]!.returns[0]!;
    assert.equal(again.value, 14, 'the correction lands');
    assert.equal(again.returnedAt, first, 'a correction does not make it newly arrived');
  });

  it('stops asking a startup that withdraws', async () => {
    const { due, kept } = await setUp();
    await repo.updateCandidate(kept.id, { status: 'Withdrawn' });
    const view = (await deliverableView(due.id))!;
    assert.equal(view.rows.length, 0, 'chasing documents from somebody who has left is chasing nobody');
  });
});

describe('a due diligence as a step of the funnel', { skip: skipWithoutServer }, () => {
  /* Before this, a Selection placed after a deliverables block walked back to
     the jury's evaluation two phases up and passed exactly the startups the
     shortlist had, file or no file. The rule on the screen said otherwise. */
  const setUp = async () => {
    const program = await repo.createProgram({ name: 'The Builders' });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const detail = await repo.getEditionDetail(edition.id);
    const track = detail!.tracks[0];
    const phase = track.phases[0];
    const jury = await repo.createBlock(phase.id, 'evaluation', 'Note du jury');
    const shortlist = await repo.createBlock(phase.id, 'selection', 'Shortlist');
    const due = await repo.createBlock(phase.id, 'deliverable', 'Due diligence');
    await repo.updateBlock(due.id, { config: { visibility: 'open', items: ITEMS } });
    const final = await repo.createBlock(phase.id, 'selection', 'Finale');

    const candidacy = async (orgName: string) => {
      const org = await dir.createRecord({ kind: 'org', name: orgName, origin: 'manual' });
      return repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id });
    };
    const ready = await candidacy('Rafid Tech');
    const short = await candidacy('Nakhla Bio');
    for (const c of [ready, short]) await repo.setOutcome(shortlist.id, c.id, 'pass', true);
    return { edition, track, jury, due, final, ready, short };
  };

  it('is what the selection behind it reads, not the jury two phases up', async () => {
    const { edition, track, due, final } = await setUp();
    const detail = await repo.getEditionDetail(edition.id);
    const fresh = detail!.tracks.find((t) => t.id === track.id)!;
    const source = selectionSource(fresh, fresh.phases[0].blocks.find((b) => b.id === final.id)!);
    assert.equal(source?.id, due.id, 'the due diligence, not the evaluation before it');
  });

  it('hands down complete and incomplete, by name', async () => {
    const { due } = await setUp();
    const block = (await repo.getBlock(due.id))!;
    assert.deepEqual(
      outcomesOf(block).map((o) => [o.id, o.label]),
      [
        ['dd_complete', 'Dossier complet'],
        ['dd_incomplete', 'Dossier incomplet'],
      ],
    );
  });

  it('calls a file complete only once every required item is accepted', async () => {
    const { due, ready, short } = await setUp();
    const block = (await repo.getBlock(due.id))!;

    const before = await outcomesByCandidate(block);
    assert.equal(before.get(ready.id)?.outcomeId, 'dd_incomplete', 'nothing sent is not in order');

    for (const item of ['rc', 'nb']) {
      await repo.saveReturn(due.id, ready.id, item, item === 'nb' ? 12 : { uploadId: 'u', filename: 'f.pdf' });
      await repo.reviewReturn(due.id, ready.id, item, 'accepted', '');
    }
    const after = await outcomesByCandidate(block);
    assert.equal(after.get(ready.id)?.outcomeId, 'dd_complete');
    assert.equal(after.get(short.id)?.outcomeId, 'dd_incomplete', 'the other one has not moved');
  });

  it('lets a call made by hand outrank the file', async () => {
    // The same rule a grid lives by: a human decision outranks the arithmetic.
    const { due, short } = await setUp();
    // The act CEED performs on screen, not a raw write: setOutcomeByHand is
    // what the route calls, and it clears the row again when the hand call
    // happens to agree with what the file says.
    await setOutcomeByHand((await repo.getBlock(due.id))!, short.id, 'dd_complete');
    const out = await outcomesByCandidate((await repo.getBlock(due.id))!);
    assert.equal(out.get(short.id)?.outcomeId, 'dd_complete');
    assert.equal(out.get(short.id)?.overridden, true);
  });
});

describe('what a founder sees of a deliverables list', { skip: skipWithoutServer }, () => {
  const setUp = async (config: Record<string, unknown>) => {
    const program = await repo.createProgram({ name: 'The Builders' });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const detail = await repo.getEditionDetail(edition.id);
    const track = detail!.tracks[0];
    const due = await repo.createBlock(track.phases[0].id, 'deliverable', 'Due diligence');
    await repo.updateBlock(due.id, { config: { items: ITEMS, ...config } });
    const org = await dir.createRecord({ kind: 'org', name: 'Rafid Tech', origin: 'manual' });
    const candidate = await repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id });
    return { edition, candidate, due };
  };

  it('shows nothing at all before the list has opened', async () => {
    // It used to appear the moment the upstream statuses put them in the pass
    // set — before anybody had opened anything.
    const { edition, candidate } = await setUp({ opensAt: '2099-01-01' });
    assert.deepEqual(await deliverablesFor(edition.id, candidate), []);
  });

  it('shows it, and takes answers, while it is open', async () => {
    const { edition, candidate } = await setUp({ visibility: 'open' });
    const [owed] = await deliverablesFor(edition.id, candidate);
    assert.equal(owed?.open, true);
  });

  it('still shows a closed list, but closed', async () => {
    // What they sent is their own record of what they handed over.
    const { edition, candidate, due } = await setUp({ visibility: 'open' });
    await repo.saveReturn(due.id, candidate.id, 'nb', 12);
    await repo.updateBlock(due.id, { config: { visibility: 'closed' } });

    const [owed] = await deliverablesFor(edition.id, candidate);
    assert.equal(owed?.open, false, 'shut');
    assert.equal(owed?.returns.length, 1, 'and still readable');
  });
});

describe('telling the startups', { skip: skipWithoutServer }, () => {
  const BODY = 'Bonjour {{startup}}, merci avant le {{date}}.\n\n{{pieces}}';

  const setUp = async () => {
    const program = await repo.createProgram({ name: 'The Builders' });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const detail = await repo.getEditionDetail(edition.id);
    const track = detail!.tracks[0];
    const due = await repo.createBlock(track.phases[0].id, 'deliverable', 'Due diligence');
    await repo.updateBlock(due.id, { config: { visibility: 'open', items: ITEMS } });

    const candidacy = async (orgName: string, email: string) => {
      const org = await dir.createRecord({ kind: 'org', name: orgName, origin: 'manual' });
      const person = await dir.createRecord({ kind: 'person', name: `${orgName} F`, email, origin: 'manual' });
      await createAccount({ email, password: 'given-by-ceed', recordId: person.id, mustChangePassword: true });
      return repo.createCandidate({
        editionId: edition.id, trackId: track.id, orgId: org.id, personId: person.id,
      });
    };
    const a = await candidacy('Rafid Tech', `rafid.${Date.now()}@example.test`);
    const b = await candidacy('Nakhla Bio', `nakhla.${Date.now()}@example.test`);
    return { edition, due, a, b };
  };

  const lettersFor = async (blockId: string) =>
    (await (await db()).query<{ n: number }>(
      `select count(*)::int as n from outbox where block_id = $1`,
      [blockId],
    ))[0]!.n;

  it('asks each startup once, however many times the button is pressed', async () => {
    const { due } = await setUp();
    await launchNotice(due.id, { kind: 'request', body: BODY });
    await sendDueNotices();
    assert.equal(await lettersFor(due.id), 2);

    // The second press finds nobody left to ask.
    assert.equal((await noticeRoster(due.id, 'request')).length, 0);
    await launchNotice(due.id, { kind: 'request', body: BODY });
    await sendDueNotices();
    assert.equal(await lettersFor(due.id), 2, 'still two');
  });

  it('does not write twice when two people launch at the same moment', async () => {
    /* The lock and the partial unique index together. Without both, each
       launch resolves the same roster, writes its own notice, and everybody
       hears about it twice. */
    const { due } = await setUp();
    await Promise.allSettled([
      launchNotice(due.id, { kind: 'request', body: BODY }),
      launchNotice(due.id, { kind: 'request', body: BODY }),
    ]);
    await sendDueNotices();
    assert.equal(await lettersFor(due.id), 2, 'one letter per startup, not two');
  });

  it('drops a startup that withdrew between the launch and the send', async () => {
    const { due, a } = await setUp();
    await launchNotice(due.id, { kind: 'request', scheduledFor: '2020-01-01', body: BODY });
    await repo.updateCandidate(a.id, { status: 'Withdrawn' });
    await sendDueNotices();

    assert.equal(await lettersFor(due.id), 1, 'only the one still in');
    const notice = (await repo.listNotices(due.id))[0]!;
    assert.equal(notice.state, 'sent', 'the notice still went');
    const target = (await repo.targetsOf(notice.id)).find((t) => t.candidateId === a.id)!;
    assert.equal(target.skipped, 'withdrawn');
  });

  it('never adds a startup that was not read back', async () => {
    const { edition, due } = await setUp();
    await launchNotice(due.id, { kind: 'request', scheduledFor: '2020-01-01', body: BODY });

    const detail = await repo.getEditionDetail(edition.id);
    const track = detail!.tracks[0];
    const org = await dir.createRecord({ kind: 'org', name: 'Latecomer', origin: 'manual' });
    await repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id });

    await sendDueNotices();
    assert.equal(await lettersFor(due.id), 2, 'the two that were looked at, and no more');
  });

  it('waits while the list has not opened, and goes once it has', async () => {
    const { due } = await setUp();
    await repo.updateBlock(due.id, { config: { visibility: 'auto', opensAt: '2099-01-01' } });
    // Launched now, against a list that opens later — the ordinary case of
    // somebody who tells people before setting the opening date.
    await launchNotice(due.id, { kind: 'request', body: BODY });

    /* Asserted on this block's own notice rather than on the tick's total:
       the sender is global, so another test file's pending notice would be
       counted here and the number would mean nothing. */
    await sendDueNotices();
    assert.equal((await repo.listNotices(due.id))[0]!.state, 'planned', 'held, not abandoned');
    assert.equal(await lettersFor(due.id), 0);

    await repo.updateBlock(due.id, { config: { visibility: 'open' } });
    await sendDueNotices();
    assert.equal(await lettersFor(due.id), 2);
  });

  it('abandons with a reason when the list was shut', async () => {
    const { due } = await setUp();
    await launchNotice(due.id, { kind: 'request', scheduledFor: '2020-01-01', body: BODY });
    await repo.updateBlock(due.id, { config: { visibility: 'closed' } });

    await sendDueNotices();
    assert.equal(await lettersFor(due.id), 0);
    const notice = (await repo.listNotices(due.id))[0]!;
    assert.equal(notice.state, 'abandoned');
    assert.match(notice.reason, /shut/i, 'and says why');
  });

  it('reminds the ones who still owe something, not the ones CEED has not read', async () => {
    const { due, a, b } = await setUp();
    // a has sent everything; nobody has read it. b has sent nothing.
    for (const item of ['rc', 'nb']) {
      await repo.saveReturn(due.id, a.id, item, item === 'nb' ? 12 : { uploadId: 'u', filename: 'f.pdf' });
    }
    const roster = await noticeRoster(due.id, 'reminder');
    assert.deepEqual(roster.map((r) => r.candidate.id), [b.id], 'chasing a would be chasing CEED');

    // One of a's items comes back: now a owes something again.
    await repo.reviewReturn(due.id, a.id, 'rc', 'rejected', 'Illisible.');
    const after = await noticeRoster(due.id, 'reminder');
    assert.equal(after.length, 2);
  });

  it('finishes a send that was interrupted', async () => {
    const { due, a } = await setUp();
    await launchNotice(due.id, { kind: 'request', scheduledFor: '2020-01-01', body: BODY });
    const notice = (await repo.listNotices(due.id))[0]!;
    // As if the process died after the first letter.
    await repo.claimTarget(notice.id, a.id);
    await repo.markTarget(notice.id, a.id, { letterId: 'msg_pretend' });

    await sendDueNotices();
    assert.equal(await lettersFor(due.id), 1, 'the other one, exactly once');
  });

  it('has asked nobody once it is cancelled, and lets the next one go out', async () => {
    /* Being named by a notice is not being told. `deliverable_asked_once` holds
       a slot per startup from the moment one is named, so a notice called off
       has to hand those slots back — otherwise the relaunch dies on a unique
       violation and the startups it had named can never be asked at all. */
    const { due } = await setUp();
    await launchNotice(due.id, { kind: 'request', scheduledFor: '2099-01-01', body: BODY });
    const notice = (await repo.listNotices(due.id))[0]!;
    await repo.settleNotice(notice.id, 'cancelled', 'Called off.');
    assert.equal((await noticeRoster(due.id, 'request')).length, 2, 'both can be asked again');

    await launchNotice(due.id, { kind: 'request', body: BODY });
    await sendDueNotices();
    assert.equal(await lettersFor(due.id), 2, 'and this time they hear it');

    const kept = (await repo.listNotices(due.id)).find((n) => n.id === notice.id)!;
    assert.equal(kept.state, 'cancelled', 'the act that was called off is still on the record');
    assert.equal(kept.reason, 'Called off.');
  });

  it('asks a startup that had no address once somebody types one in', async () => {
    /* Named, then left out at the hour: it was never told, so it must not be
       barred for good. The case is ordinary — a contact filled in a week after
       the first send. */
    const { edition, due } = await setUp();
    const detail = await repo.getEditionDetail(edition.id);
    const org = await dir.createRecord({ kind: 'org', name: 'Sans adresse', origin: 'manual' });
    const person = await dir.createRecord({ kind: 'person', name: 'Plus tard', origin: 'manual' });
    const late = await repo.createCandidate({
      editionId: edition.id, trackId: detail!.tracks[0].id, orgId: org.id, personId: person.id,
    });

    await launchNotice(due.id, { kind: 'request', body: BODY });
    await sendDueNotices();
    assert.equal(await lettersFor(due.id), 2, 'the two that could hear it');

    const address = `plus-tard.${Date.now()}@example.test`;
    await dir.updateRecord(person.id, { email: address });
    await createAccount({ email: address, password: 'given-by-ceed', recordId: person.id });

    const again = await noticeRoster(due.id, 'request');
    assert.deepEqual(
      again.map((r) => r.candidate.orgName),
      ['Sans adresse'],
      'back on the list, and nobody else with it',
    );
    await launchNotice(due.id, { kind: 'request', body: BODY });
    await sendDueNotices();
    assert.equal(await lettersFor(due.id), 3, 'and now there are three');
    assert.equal((await noticeRoster(due.id, 'request')).find((r) => r.candidate.id === late.id), undefined);
  });

  it('leaves out a startup with no address, and says so by name', async () => {
    const { edition, due } = await setUp();
    const detail = await repo.getEditionDetail(edition.id);
    const org = await dir.createRecord({ kind: 'org', name: 'Sans adresse', origin: 'manual' });
    await repo.createCandidate({ editionId: edition.id, trackId: detail!.tracks[0].id, orgId: org.id });

    const roster = await noticeRoster(due.id, 'request');
    const mute = roster.find((r) => r.candidate.orgName === 'Sans adresse')!;
    assert.equal(mute.blocked, 'no_email', 'named on the screen, left out of the send');

    await launchNotice(due.id, { kind: 'request', body: BODY });
    await sendDueNotices();
    assert.equal(await lettersFor(due.id), 2, 'the two that can hear it');
  });

  it('tells a founder at once when something is sent back, with the reason', async () => {
    /* The worst state this block can be in is a piece sitting refused that
       nobody mentioned: CEED waits, the startup waits, and the closing date
       arrives. So this one is not an act somebody launches. */
    const { due, a } = await setUp();
    await repo.saveReturn(due.id, a.id, 'rc', { uploadId: 'u1', filename: 'rc.pdf' });
    await repo.reviewReturn(due.id, a.id, 'rc', 'rejected', 'Le registre date de 2024.');
    await tellReturned(due.id, a.id, 'rc', 'Le registre date de 2024.');

    const [letter] = await letters({ candidateId: a.id });
    assert.equal(letter?.kind, 'deliverable_rejected');
    /* By first name now, which is what the default template opens on — and
       the org's own name is in the subject, where it belongs. */
    assert.match(letter!.body, /Bonjour Rafid,/, 'addressed by their own name');
    assert.ok(!letter!.body.includes('{{'), 'and nothing left unfilled');
    assert.match(letter!.body, /Le registre date de 2024\./, 'carrying the reason already typed');
    assert.match(letter!.subject, /Registre de commerce/, 'and says which piece in the subject');
  });

  it('says nothing to a founder with no address, rather than failing the review', async () => {
    const { edition, due } = await setUp();
    const detail = await repo.getEditionDetail(edition.id);
    const org = await dir.createRecord({ kind: 'org', name: 'Sans adresse', origin: 'manual' });
    const mute = await repo.createCandidate({
      editionId: edition.id, trackId: detail!.tracks[0].id, orgId: org.id,
    });
    await repo.saveReturn(due.id, mute.id, 'rc', { uploadId: 'u2', filename: 'rc.pdf' });
    await repo.reviewReturn(due.id, mute.id, 'rc', 'rejected', 'Illisible.');
    await tellReturned(due.id, mute.id, 'rc', 'Illisible.');
    assert.equal((await letters({ candidateId: mute.id })).length, 0);
  });

  it('writes to one startup again when somebody asks for it by name', async () => {
    /* The case this exists for: a letter that bounced and an address corrected
       since. The list would say "already asked" and leave that startup to miss
       the whole phase — so naming one skips the filters on purpose. */
    const { due, a } = await setUp();
    await launchNotice(due.id, { kind: 'request', body: BODY });
    await sendDueNotices();
    assert.equal(await lettersFor(due.id), 2);
    assert.equal((await noticeRoster(due.id, 'request')).length, 0, 'the list has nobody left');

    const named = await noticeRoster(due.id, 'request', a.id);
    assert.equal(named.length, 1, 'naming one finds it anyway');

    await launchNotice(due.id, { kind: 'request', body: BODY, only: a.id });
    await sendDueNotices();
    assert.equal(await lettersFor(due.id), 3, 'and it goes');
    assert.equal(
      (await letters({ candidateId: a.id, blockId: due.id })).length,
      2,
      'both are on that startup’s record',
    );
  });

  it('writes to nobody else when one is named', async () => {
    const { due, a, b } = await setUp();
    await launchNotice(due.id, { kind: 'request', body: BODY, only: a.id });
    await sendDueNotices();
    assert.equal((await letters({ candidateId: a.id, blockId: due.id })).length, 1);
    assert.equal((await letters({ candidateId: b.id, blockId: due.id })).length, 0);
  });

  it('keeps what was already done on the record when it writes again', async () => {
    const { due, a } = await setUp();
    await launchNotice(due.id, { kind: 'request', body: BODY });
    await sendDueNotices();
    const first = (await deliverableView(due.id))!.rows.find((r) => r.candidate.id === a.id)!.askedAt;

    await launchNotice(due.id, { kind: 'request', body: BODY, only: a.id });
    await sendDueNotices();
    const notices = await repo.listNotices(due.id);
    assert.equal(notices.length, 2, 'two acts, neither erased');
    assert.ok(first, 'and the first date was real');
  });

  it('says the same closing date in the preview and in the letter', async () => {
    /* The screen used to format the day itself — “15 Nov 2026” on screen, and
       “2026-11-15” in what went out. A preview whose job is to show the letter
       cannot compose any part of it on its own. */
    const { due, a } = await setUp();
    await repo.updateBlock(due.id, { config: { closesAt: '2026-11-15' } });
    assert.equal((await rosterFor(due.id, 'request')).dateLabel, '15 novembre 2026');

    await launchNotice(due.id, { kind: 'request', body: 'avant le {{date}}' });
    await sendDueNotices();
    const [letter] = await letters({ candidateId: a.id });
    assert.equal(letter?.body, 'avant le 15 novembre 2026');
  });

  it('says whether the letter arrived, not only that it was written', async () => {
    /* A letter that came back is not a startup that was told, and a column
       showing only the date it was written would read as though it were. */
    const { due, a, b } = await setUp();
    await launchNotice(due.id, { kind: 'request', body: BODY });
    await sendDueNotices();

    const flying = (await deliverableView(due.id))!.rows.find((r) => r.candidate.id === a.id);
    assert.equal(flying?.delivery, 'flying', 'handed over, nothing back yet');

    const conn = await db();
    const [mine] = await conn.query<{ id: string }>(
      `select id from outbox where block_id = $1 and candidate_id = $2`, [due.id, a.id],
    );
    await conn.query(`update outbox set delivered_at = now() where id = $1`, [mine!.id]);
    const [theirs] = await conn.query<{ id: string }>(
      `select id from outbox where block_id = $1 and candidate_id = $2`, [due.id, b.id],
    );
    await conn.query(`update outbox set state = 'bounced' where id = $1`, [theirs!.id]);

    const after = (await deliverableView(due.id))!.rows;
    assert.equal(after.find((r) => r.candidate.id === a.id)?.delivery, 'arrived');
    assert.equal(after.find((r) => r.candidate.id === b.id)?.delivery, 'lost');
    assert.ok(after.find((r) => r.candidate.id === b.id)?.askedAt, 'still on the record as written to');
  });

  it('fills a letter with what that startup owes, and leaves an unknown name alone', async () => {
    assert.equal(fillTemplate('Bonjour {{startup}}', { startup: 'Rafid Tech' }), 'Bonjour Rafid Tech');
    assert.equal(fillTemplate('Bonjour {{inconnu}}', {}), 'Bonjour {{inconnu}}', 'visible rather than silently empty');
  });

  /* La plupart des destinataires ont déjà un accès : c'est le cas courant, pas
     le cas limite, et il ne doit pas laisser de trou. */
  it('lets a variable with nothing to say take its own line with it', () => {
    const letter = 'Depuis votre espace : ici\n\n{{acces}}\n\nL\'équipe CEED';
    assert.equal(
      fillTemplate(letter, { acces: '' }),
      "Depuis votre espace : ici\n\nL'équipe CEED",
      'no gap where the paragraph would have been',
    );
    assert.equal(
      fillTemplate(letter, { acces: 'Votre mot de passe : abc' }),
      "Depuis votre espace : ici\n\nVotre mot de passe : abc\n\nL'équipe CEED",
      'and nothing moved when it does have something to say',
    );
    assert.equal(
      fillTemplate('Bonjour\n\n{{acces}}', { acces: '' }),
      'Bonjour',
      'including at the very end, where no blank line follows it',
    );
    assert.equal(
      fillTemplate('Bonjour {{acces}} vous', { acces: '' }),
      'Bonjour  vous',
      'a name used inside a sentence stays inside its sentence',
    );
  });
});

/**
 * Une lettre d'essai.
 *
 * Trying it on yourself before twenty-five people read it. The whole value of
 * it rests on changing nothing: a test that marked somebody as told, or opened
 * their account, would be a send under another name — and the screen would
 * then say twenty-four where it meant twenty-five.
 */
describe('sending a test', { skip: skipWithoutServer }, () => {
  const setUp = async () => {
    const stamp = `${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    const program = await repo.createProgram({ name: 'The Builders' });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const detail = await repo.getEditionDetail(edition.id);
    const track = detail!.tracks[0];
    const due = await repo.createBlock(track.phases[0].id, 'deliverable', 'Due diligence');
    await repo.updateBlock(due.id, { config: { visibility: 'open', closesAt: '2026-11-15', items: ITEMS } });

    const org = await dir.createRecord({ kind: 'org', name: `Rafid Tech ${stamp}`, origin: 'manual' });
    const person = await dir.createRecord({
      kind: 'person', name: `Karim ${stamp}`, email: `karim.${stamp}@example.test`, origin: 'manual',
    });
    const candidate = await repo.createCandidate({
      editionId: edition.id, trackId: track.id, orgId: org.id, personId: person.id,
    });
    return { due, candidate, person, stamp };
  };

  it('writes the letter as that startup would read it, to the address given', async () => {
    const { due, candidate, stamp } = await setUp();
    const to = `moi.${stamp}@ceed.test`;
    await sendTest(due.id, {
      kind: 'request',
      body: 'Bonjour {{prenom}}, avant le {{date}} :\n{{pieces}}',
      subjectId: candidate.id,
      to,
    });

    const [letter] = await letters({ email: to });
    assert.match(letter!.body, /Bonjour Karim,/);
    assert.match(letter!.body, /15 novembre 2026/);
    assert.match(letter!.body, /Registre de commerce/, 'what this one actually owes');
    assert.match(letter!.subject, /^\[Essai\]/, 'and marked, so nobody mistakes it');
  });

  it('records nobody as told', async () => {
    const { due, candidate, stamp } = await setUp();
    await sendTest(due.id, { kind: 'request', body: 'x', subjectId: candidate.id, to: `a.${stamp}@ceed.test` });
    assert.equal((await repo.listNotices(due.id)).length, 0, 'no notice');
    assert.equal((await noticeRoster(due.id, 'request')).length, 1, 'still on the list to ask');
  });

  it('opens no account by being looked at', async () => {
    /* `{{acces}}` is the one value a preview cannot be, so the test shows the
       sample rather than creating the real thing. */
    const { due, candidate, person, stamp } = await setUp();
    await sendTest(due.id, {
      kind: 'request',
      body: '{{acces}}',
      subjectId: candidate.id,
      to: `b.${stamp}@ceed.test`,
    });
    assert.equal(await accountOfRecord(person.id), null);
    const [letter] = await letters({ email: `b.${stamp}@ceed.test` });
    assert.match(letter!.body, /••/, 'dots, not a password that works');
  });

  it('says what became of it rather than announcing a success it cannot know', async () => {
    /* Outside production nothing leaves, and a button that said "sent" would
       send somebody to watch an inbox that stays empty. */
    const { due, candidate, stamp } = await setUp();
    const out = await sendTest(due.id, {
      kind: 'request', body: 'x', subjectId: candidate.id, to: `d.${stamp}@ceed.test`,
    });
    assert.equal(out.live, false);
    assert.equal(out.written, true, 'written down all the same');
    assert.equal(out.state, 'held', 'and said to be held, not sent');
  });

  it('names the address when it is the address that holds it back', async () => {
    /* En production, « tenue » ne veut pas dire la même chose : la lettre n'a
       pas été remise au fournisseur, et chercher le message dans son tableau
       de bord est une heure perdue. */
    const { due, candidate, stamp } = await setUp();
    const gone = `gone.${stamp}@ceed.test`;
    await suppress(gone, 'hard bounce');
    const out = await sendTest(due.id, { kind: 'request', body: 'x', subjectId: candidate.id, to: gone });
    assert.equal(out.state, 'held');
    assert.match(out.error, /bounced for good/, 'and says which of the two holds it');
  });

  it('hands over the password in this block\'s own words', async () => {
    /* Le texte vit dans la brique, et c'est la brique qui l'envoie : une
       deuxième brique qui dirait la même chose autrement ne doit rien changer
       à celle-ci. */
    const { due, candidate, stamp } = await setUp();
    await repo.updateBlock(due.id, {
      config: {
        visibility: 'open',
        closesAt: '2026-11-15',
        items: ITEMS,
        messages: { access: 'Vos identifiants :\n{{email}}\n{{motdepasse}}' },
      },
    });

    const values = await deliverableNotices.preview(due.id, 'request', candidate.id);
    assert.match(values.acces!, /Vos identifiants :/, 'the preview says what this block says');
    assert.doesNotMatch(values.acces!, /Votre première connexion/, 'and not what the default said');

    const written = await deliverableNotices.letter(due.id, 'request', candidate.id, '{{acces}}');
    assert.match(written!.body, /Vos identifiants :/);
    assert.match(written!.body, new RegExp(`karim\\.${stamp}@example\\.test`), 'with their address');
    assert.doesNotMatch(written!.body, /••/, 'and a password that works');
  });

  it('promises a first login only where the letter will carry one', async () => {
    /* A candidacy with no person attached has nobody to open an account for.
       Showing the paragraph in the preview and omitting it from the letter is
       the one thing this preview exists to prevent. */
    const { due } = await setUp();
    const org = await dir.createRecord({ kind: 'org', name: `Sans contact ${Date.now()}`, origin: 'manual' });
    const detail = await repo.blockContext(due.id);
    const alone = await repo.createCandidate({
      editionId: detail!.editionId, trackId: (await repo.getEditionDetail(detail!.editionId))!.tracks[0].id,
      orgId: org.id,
    });
    const values = await deliverableNotices.preview(due.id, 'request', alone.id);
    assert.equal(values.acces, '', 'nothing promised');
  });

  it('writes nothing to the startup itself', async () => {
    const { due, candidate, stamp } = await setUp();
    await sendTest(due.id, { kind: 'request', body: 'x', subjectId: candidate.id, to: `c.${stamp}@ceed.test` });
    assert.equal((await letters({ candidateId: candidate.id })).length, 0);
  });
});
