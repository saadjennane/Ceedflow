/**
 * « Affichée seulement si » : une règle par question, sur une question d'avant —
 * jamais obligatoire cachée, sa réponse cachée ne part pas, et une règle qui ne
 * tient plus laisse la question visible.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  formProgress, missingRequired, requiredShown, shownAnswers, shownFieldIds, type DeliverableItem, type FormField,
} from '@ceed/shared';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { getMeeting, planMeetings, savePrep } from '../src/services/oneToOne.js';
import { closeDb, skipWithoutServer } from './helpers.js';

const q = (id: string, extra: Partial<FormField> = {}): FormField => ({
  id, type: 'short_text', label: id, help: '', required: false, options: [], showInTable: false, pageId: '', ...extra,
});

const form: FormField[] = [
  q('legal', { type: 'select', options: ['SARL', 'SA', 'Auto-entrepreneur'] }),
  q('capital', { required: true, showIf: { fieldId: 'legal', op: 'is', value: 'SARL' } }),
  q('capitalProof', { type: 'file', showIf: { fieldId: 'capital', op: 'answered', value: '' } }),
  q('sectors', { type: 'multiselect', options: ['Agritech', 'Fintech'] }),
  q('farm', { showIf: { fieldId: 'sectors', op: 'includes', value: 'Agritech' } }),
];

describe('a question shown only if', () => {
  it('follows the answer it looks at, and hides in a chain', () => {
    assert.deepEqual([...shownFieldIds(form, {})], ['legal', 'sectors']);
    assert.ok(shownFieldIds(form, { legal: 'SARL' }).has('capital'));
    assert.ok(!shownFieldIds(form, { legal: 'SARL' }).has('capitalProof'), 'not answered yet');
    assert.ok(shownFieldIds(form, { legal: 'SARL', capital: '10 000' }).has('capitalProof'));
    assert.ok(!shownFieldIds(form, { legal: 'SA', capital: '10 000' }).has('capitalProof'), 'its parent is hidden: hidden too');
    assert.ok(shownFieldIds(form, { sectors: ['Fintech', 'Agritech'] }).has('farm'));
    assert.ok(!shownFieldIds(form, { sectors: ['Fintech'] }).has('farm'));
  });

  it('counts progress on the questions one sees — a hidden one is not missing', () => {
    assert.deepEqual(formProgress(form, {}), { done: 0, total: 2 });
    assert.deepEqual(formProgress(form, { legal: 'SARL' }), { done: 1, total: 3 }, 'its follow-up appears, unanswered');
    assert.deepEqual(formProgress(form, { legal: 'SA', capital: 'kept' }), { done: 1, total: 2 }, 'a hidden answer does not count');
  });

  it('is never required hidden, and its answer does not leave once hidden', () => {
    assert.deepEqual(missingRequired(form, { legal: 'SA' }).map((f) => f.id), []);
    assert.deepEqual(missingRequired(form, { legal: 'SARL' }).map((f) => f.id), ['capital']);
    assert.deepEqual(shownAnswers(form, { legal: 'SA', capital: '10 000', other: 'kept' }), { legal: 'SA', other: 'kept' });
  });

  it('shows the question when its rule no longer holds — parent removed, moved after, or option gone', () => {
    const removed = form.filter((f) => f.id !== 'legal');
    assert.ok(shownFieldIds(removed, {}).has('capital'));
    const moved = [form[1]!, form[0]!];
    assert.ok(shownFieldIds(moved, {}).has('capital'));
    const lost = [q('legal', { type: 'select', options: ['SA'] }), form[1]!];
    assert.ok(shownFieldIds(lost, {}).has('capital'));
  });

  it('asks a deliverable only of the startup its rule concerns', () => {
    const items = [
      { ...q('form', { type: 'select', options: ['SARL', 'SA'], required: true }), kind: 'field', fields: [], repeatable: false, each: '' },
      { ...q('statuts', { type: 'file', required: true, showIf: { fieldId: 'form', op: 'is', value: 'SARL' } }), kind: 'field', fields: [], repeatable: false, each: '' },
    ] as DeliverableItem[];
    assert.deepEqual(requiredShown(items, (id) => ({ form: 'SA' } as Record<string, unknown>)[id]).map((i) => i.id), ['form']);
    assert.deepEqual(requiredShown(items, (id) => ({ form: 'SARL' } as Record<string, unknown>)[id]).map((i) => i.id), ['form', 'statuts']);
  });
});

describe('a form sent with a hidden question', { skip: skipWithoutServer }, () => {
  before(migrate);
  after(closeDb);

  it('sends without the hidden required question, and keeps none of its answer', async () => {
    const mark = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const program = await repo.createProgram({ name: `Grow ${mark}` });
    const edition = await repo.createEdition(program.id, { name: '2026' });
    await repo.updateEdition(edition.id, { status: 'Live' });
    const track = (await repo.getEditionDetail(edition.id))!.tracks[0]!;
    const block = await repo.createBlock(track.phases[0]!.id, 'one_to_one', 'Mentoring');
    const mentor = await dir.createRecord({ kind: 'person', name: `Nadia ${mark}`, origin: 'manual' });
    const config = (await repo.getBlock(block.id))!.config as object;
    await repo.updateBlock(block.id, {
      config: { ...config, interlocutors: [mentor.id], prep: { enabled: true, fields: form.slice(0, 3) } },
    });
    const org = await dir.createRecord({ kind: 'org', name: `Atlas ${mark}`, origin: 'manual' });
    const a = await repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id, personId: null, originBlockId: null });
    const [m] = await planMeetings(block.id, { candidateIds: [a.id], personId: mentor.id, invite: 'none', heldOn: '2030-10-10', startTime: '10:00' });

    await assert.rejects(savePrep(m!.id, { legal: 'SARL' }, { side: 'startup', name: 'Atlas', submit: true }), /missing/);
    await savePrep(m!.id, { legal: 'SA', capital: 'typed before changing their mind' }, { side: 'startup', name: 'Atlas', submit: true });
    assert.deepEqual((await getMeeting(m!.id))!.prep, { legal: 'SA' });
  });
});
