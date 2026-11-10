/**
 * Le parcours d'une startup dans un programme, tel qu'elle le lit : les phases
 * du programme tel qu'il est construit, et ce qu'elle y a fait — rien d'autre.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { journeyFor } from '../src/services/journey.js';
import { changeMeeting, planMeetings } from '../src/services/oneToOne.js';
import { closeDb, skipWithoutServer } from './helpers.js';
import { directoryRows } from '../src/services/people.js';

before(migrate);
after(closeDb);

describe('a startup’s journey through a programme', { skip: skipWithoutServer }, () => {
  it('says the phase reached, the next one, and what was done — an unannounced selection left out', async () => {
    const mark = `${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    const program = await repo.createProgram({ name: `Grow ${mark}` });
    const edition = await repo.createEdition(program.id, { name: '2026' });
    const track = (await repo.getEditionDetail(edition.id))!.tracks[0]!;
    const first = track.phases[0]!;
    const form = await repo.createBlock(first.id, 'application', 'Candidature');
    const pick = await repo.createBlock(first.id, 'selection', 'Shortlist');
    const second = await repo.createPhase(track.id, 'Accompagnement');
    const mentoring = await repo.createBlock(second.id, 'one_to_one', 'Mentoring');
    const third = await repo.createPhase(track.id, 'Clôture');

    const org = await dir.createRecord({ kind: 'org', name: `Atlas ${mark}`, origin: 'manual' });
    const founder = await dir.createRecord({ kind: 'person', name: 'Salma Founder', origin: 'manual' });
    await dir.linkRecords({ personId: founder.id, orgId: org.id, access: 'admin' });
    const stranger = await dir.createRecord({ kind: 'person', name: 'Somebody Else', origin: 'manual' });
    await repo.updateBlock(form.id, {
      config: { fields: [
        { id: 'pitch', type: 'long_text', label: 'Votre projet', help: '', required: true, options: [] },
        { id: 'left', type: 'short_text', label: 'Laissé vide', help: '', required: false, options: [] },
      ] },
    });
    const c = await repo.createCandidate({
      editionId: edition.id, trackId: track.id, orgId: org.id, personId: founder.id, originBlockId: form.id, answers: { pitch: 'Une plateforme' },
    });

    let j = (await journeyFor(founder.id, c.id))!;
    assert.deepEqual(j.phases.map((p) => p.state), ['current', 'upcoming', 'upcoming'], 'applied: the first phase');
    assert.ok(j.history.some((h) => h.kind === 'application'));
    assert.deepEqual(j.application.map((a) => [a.label, a.value]), [['Votre projet', 'Une plateforme']], 'its answers, to read again — blanks left out');
    assert.equal(await journeyFor(stranger.id, c.id), null, 'not somebody else’s');

    // Retenue, mais pas encore annoncée : elle avance, l'histoire n'en dit rien encore.
    await repo.setOutcome(pick.id, c.id, 'pass', true);
    j = (await journeyFor(founder.id, c.id))!;
    assert.equal(j.phases.find((p) => p.state === 'current')?.id, second.id, 'through the selection: the next phase');
    assert.equal(j.next, third.name);
    assert.ok(!j.history.some((h) => h.kind === 'selection'), 'not told before it is announced');

    await repo.updateBlock(pick.id, { config: { publishedAt: '2026-10-01T09:00:00Z' } });
    const mentor = await dir.createRecord({ kind: 'person', name: `Nadia ${mark}`, origin: 'manual' });
    await repo.updateBlock(mentoring.id, { config: { interlocutors: [mentor.id], report: { fields: [] }, visibility: 'open', perStartup: 2 } });
    const [m] = await planMeetings(mentoring.id, { candidateIds: [c.id], personId: mentor.id, invite: 'none', heldOn: '2026-10-20', startTime: '10:00' });
    await changeMeeting(m!.id, { status: 'held' });

    j = (await journeyFor(founder.id, c.id))!;
    assert.deepEqual(new Set(j.history.map((h) => h.kind)), new Set(['application', 'selection', 'one_to_one']));
    assert.deepEqual(j.history.map((h) => h.at), [...j.history.map((h) => h.at)].sort().reverse(), 'most recent first');
    assert.equal(j.history.find((h) => h.kind === 'one_to_one')!.phase, 'Accompagnement');
    assert.equal(j.history.find((h) => h.kind === 'one_to_one')!.href, `/meet/${m!.token}`, 'no preparation: the session’s own page');

    // Passée sans être marquée tenue : elle a eu lieu pour la startup.
    const [late] = await planMeetings(mentoring.id, { candidateIds: [c.id], personId: mentor.id, invite: 'none', heldOn: '2026-01-15', startTime: '10:00' });
    j = (await journeyFor(founder.id, c.id))!;
    assert.ok(j.history.some((h) => h.kind === 'one_to_one' && h.at === '2026-01-15' && h.href === `/meet/${late!.token}`));

    // L'annuaire le dit sans ouvrir la fiche : la séance du mentor, le programme de la startup.
    const rows = await directoryRows();
    assert.equal(rows.people.get(mentor.id)?.sessions, 1);
    assert.deepEqual(rows.orgs.get(org.id)?.programmes.map((p) => p.state), ['applied']);
  });
});
