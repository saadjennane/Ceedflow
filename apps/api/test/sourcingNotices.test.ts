/**
 * Inviter la base à candidater.
 *
 * The one letter that goes to people who are not in a programme yet. It
 * carries the channel's own link, which is what lets a candidacy arriving
 * three weeks later be traced back to the call that brought it — so a letter
 * sent through no channel quietly loses the only question this brick exists to
 * answer.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { letters } from '../src/services/mail.js';
import { noteOrigin } from '../src/services/platform.js';
import { launchNotice, sendDueNotices } from '../src/services/notices.js';
import { SOURCING_KIND, sourcingAudiences, sourcingRoster, sourcingValues } from '../src/services/sourcingNotices.js';
import { closeDb, skipWithoutServer } from './helpers.js';

before(migrate);
after(closeDb);

const BODY = 'Bonjour {{nom}}, candidatez avant le {{cloture}} : {{lien}}';

describe('calling for applications', { skip: skipWithoutServer }, () => {
  const setUp = async (over: Record<string, unknown> = {}) => {
    const stamp = `${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    /* The audience is a filter over the whole directory, so a tag shared
       between tests makes each one see the others' people. */
    const tag = `reseau.${stamp}`;
    const program = await repo.createProgram({ name: 'The Builders' });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const detail = await repo.getEditionDetail(edition.id);
    const track = detail!.tracks[0];
    const phase = track.phases[0];

    const call = await repo.createBlock(phase.id, 'sourcing', 'Appel à candidatures');
    const form = await repo.createBlock(phase.id, 'application', 'Candidature');
    await repo.updateBlock(form.id, {
      config: {
        visibility: 'open',
        closesAt: '2026-11-15',
        fields: [{ id: 'd', type: 'long_text', label: 'Quoi ?', required: true }],
      },
    });

    const person = async (name: string, tag: string, email = true) => {
      const record = await dir.createRecord({
        kind: 'person',
        name: `${name} ${stamp}`,
        origin: 'manual',
        ...(email ? { emails: [`${name.toLowerCase()}.${stamp}@example.test`] } : {}),
        tags: [tag],
      });
      return record;
    };
    const karim = await person('Karim', tag);
    const nawal = await person('Nawal', tag);
    const mute = await person('Sans', tag, false);

    await repo.updateBlock(call.id, {
      config: {
        channels: [{ id: 'ch1', label: 'Réseau CEED' }],
        audience: { roles: [], tags: [tag], recordIds: [] },
        outreach: { subject: 'Candidatez à The Builders', body: BODY, channelId: 'ch1' },
        ...over,
      },
    });
    return { call, form, tag, karim, nawal, mute };
  };

  it('names everybody the filter catches, including those it cannot write to', async () => {
    /* The window promises to name everybody it cannot reach, so they can be
       fixed. This brick used to count them instead — a number where every
       other one gives you a name to go and look up. */
    const { call, karim, nawal, mute } = await setUp();
    const roster = await sourcingRoster(call.id, SOURCING_KIND);
    const ids = roster.map((r) => r.subjectId);
    assert.ok(ids.includes(karim.id) && ids.includes(nawal.id));
    assert.equal(roster.find((r) => r.subjectId === mute.id)?.blocked, 'no_email', 'named, and left out');
    assert.ok(roster.every((r) => r.as === 'person'), 'these are not candidacies yet');
  });

  it('reaches a startup through whoever holds its page', async () => {
    /* Une startup venue d'une candidature n'a presque jamais d'adresse à elle :
       celle du formulaire est rangée sur la fiche du contact, liée à la
       société. Ne regarder que l'adresse propre déclarait injoignable toute une
       promotion dont on avait pourtant l'adresse de chacun. */
    const { call, tag } = await setUp();
    const stamp = `${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    const org = await dir.createRecord({ kind: 'org', name: `Rafid ${stamp}`, origin: 'manual', tags: [tag] });
    const founder = await dir.createRecord({
      kind: 'person', name: `Zineb ${stamp}`, origin: 'manual',
      emails: [`zineb.${stamp}@example.test`],
    });
    await dir.linkRecords({ personId: founder.id, orgId: org.id, access: 'admin' });

    const roster = await sourcingRoster(call.id, SOURCING_KIND);
    const row = roster.find((r) => r.subjectId === org.id);
    assert.equal(row?.blocked, '', 'elle est joignable');
    assert.equal(row?.email, `zineb.${stamp}@example.test`);
    /* Adressée à la personne dont c'est la boîte : « Bonjour Rafid Tech » dans
       sa messagerie n'est adressé à personne. */
    assert.equal(row?.toName, `Zineb ${stamp}`);
    assert.equal(row?.orgName, `Rafid ${stamp}`, 'mais c’est bien la société qu’on invite');

    const values = await sourcingValues(call.id, org.id, true);
    assert.equal(values?.prenom, 'Zineb', 'le prénom de qui lit');
    assert.equal(values?.nom, `Rafid ${stamp}`, 'le nom de qui est invité');
  });

  it('keeps a company’s own address when it has one', async () => {
    const { call, tag } = await setUp();
    const stamp = `${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    const org = await dir.createRecord({
      kind: 'org', name: `Innolia ${stamp}`, origin: 'manual', tags: [tag],
      emails: [`contact.${stamp}@example.test`],
    });
    const founder = await dir.createRecord({
      kind: 'person', name: `Omar ${stamp}`, origin: 'manual', emails: [`omar.${stamp}@example.test`],
    });
    await dir.linkRecords({ personId: founder.id, orgId: org.id, access: 'admin' });

    const row = (await sourcingRoster(call.id, SOURCING_KIND)).find((r) => r.subjectId === org.id);
    assert.equal(row?.email, `contact.${stamp}@example.test`);
    assert.equal(row?.toName, `Innolia ${stamp}`, 'et c’est elle qu’on salue');
  });

  it('still names a company nobody can be reached through', async () => {
    const { call, tag } = await setUp();
    const stamp = `${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    const org = await dir.createRecord({ kind: 'org', name: `Muette ${stamp}`, origin: 'manual', tags: [tag] });

    const row = (await sourcingRoster(call.id, SOURCING_KIND)).find((r) => r.subjectId === org.id);
    assert.equal(row?.blocked, 'no_email', 'nommée, et laissée de côté');
  });

  it('carries the channel’s own link, absolute, which is what makes a candidacy traceable', async () => {
    const { call, karim } = await setUp();
    await noteOrigin('https', 'www.ceedflow.com');
    const values = await sourcingValues(call.id, karim.id);
    /* "/apply/xyz" in an inbox is a dead string: a browser is already
       somewhere, a letter is not. */
    assert.match(values!.lien, /^https:\/\/www\.ceedflow\.com\/apply\//, 'absolute');
    assert.match(values!.lien, /via=ch1/, 'and carrying the channel');
    assert.equal(values!.canal, 'Réseau CEED');
    assert.equal(values!.cloture, '15 novembre 2026', 'and the day the form shuts');
  });

  it('writes to them once the form is published', async () => {
    const { call, karim } = await setUp();
    await launchNotice(call.id, { kind: SOURCING_KIND, body: BODY });
    await sendDueNotices();

    const record = await dir.getRecord(karim.id);
    const [letter] = await letters({ email: record!.email! });
    assert.ok(letter, 'it went');
    assert.match(letter!.body, /Karim/);
    assert.match(letter!.body, /15 novembre 2026/);
    assert.equal(letter!.subject, 'Candidatez à The Builders');
    assert.ok(!letter!.body.includes('{{'), 'and nothing left unfilled');
  });

  it('waits rather than inviting people to a form nobody can open', async () => {
    /* The one impression this call gets. Waited for rather than abandoned:
       publishing the form after scheduling the invitations is an ordinary
       order to do things in. */
    const { call, form } = await setUp();
    await repo.updateBlock(form.id, { config: { visibility: 'closed' } });
    await launchNotice(call.id, { kind: SOURCING_KIND, body: BODY });
    await sendDueNotices();
    assert.equal((await repo.listNotices(call.id))[0]!.state, 'planned');
  });

  it('writes to each person once, however many times the call is sent', async () => {
    const { call, karim } = await setUp();
    for (let i = 0; i < 3; i++) {
      await launchNotice(call.id, { kind: SOURCING_KIND, body: BODY });
      await sendDueNotices();
    }
    const record = await dir.getRecord(karim.id);
    assert.equal((await letters({ email: record!.email! })).length, 1);
  });

  it('picks up somebody the filter catches later', async () => {
    /* A call is widened after the first send — a tag added to thirty more
       records. They are new to the list, not already written to. */
    const { call, tag } = await setUp();
    await launchNotice(call.id, { kind: SOURCING_KIND, body: BODY });
    await sendDueNotices();
    assert.equal((await sourcingRoster(call.id, SOURCING_KIND)).filter((r) => !r.blocked).length, 0);

    const stamp = Date.now();
    await dir.createRecord({
      kind: 'person', name: `Tardif ${stamp}`, emails: [`tardif.${stamp}@example.test`],
      origin: 'manual', tags: [tag],
    });
    const again = await sourcingRoster(call.id, SOURCING_KIND);
    assert.equal(again.filter((r) => !r.blocked).length, 1, 'and only them');
  });

  it('counts the audience, what is left, and what has been said', async () => {
    const { call } = await setUp();
    await launchNotice(call.id, { kind: SOURCING_KIND, body: BODY });
    await sendDueNotices();
    const { audiences, ready } = await sourcingAudiences(call.id);
    assert.equal(ready, true);
    assert.equal(audiences[0]!.count, 3, 'the whole list, reachable or not');
    assert.equal(audiences[0]!.told, 2);
    assert.equal(audiences[0]!.reachable, 0, 'nothing left to press');
  });
});
