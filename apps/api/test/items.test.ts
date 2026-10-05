/**
 * Ce qui compte pour un, et ce qui peut se répéter.
 *
 * Two properties, deliberately independent. Group decides what counts as one
 * deliverable and is accepted or sent back as one; repeatable decides how many
 * times it may occur. The four combinations are all ordinary, and the counting
 * is the whole reason the first one exists: three fields left ungrouped make a
 * file read 2/5 for a missing IBAN, and the number stops measuring what it
 * claims to measure.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deliverableItemSchema,
  entryComplete,
  itemComplete,
  itemEntries,
  itemGiven,
  itemUnfinished,
  uploadIdsIn,
} from '@ceed/shared';

const field = (id: string, required = true, type = 'short_text') =>
  deliverableItemSchema.parse({ id, type, label: id, required });

const group = (id: string, fields: { id: string; required?: boolean }[], over = {}) =>
  deliverableItemSchema.parse({
    id,
    type: 'short_text',
    label: id,
    kind: 'group',
    required: true,
    fields: fields.map((f) => ({ id: f.id, type: 'short_text', label: f.id, required: f.required ?? true })),
    ...over,
  });

describe('a plain field, as it always was', () => {
  it('is given when it holds something', () => {
    assert.equal(itemGiven(field('rc'), 'x'), true);
    assert.equal(itemGiven(field('rc'), ''), false);
    assert.equal(itemGiven(field('rc'), null), false);
  });
});

describe('a group — what counts as one', () => {
  const bank = group('bank', [{ id: 'rib' }, { id: 'name' }, { id: 'iban' }]);

  it('is one deliverable, not three', () => {
    // The case this exists for: without it, a file missing only the IBAN reads
    // 2/5 and the number stops meaning anything.
    assert.equal(itemComplete(bank, { rib: 'a', name: 'b', iban: 'c' }), true);
  });

  it('is not complete while one of its required fields is empty', () => {
    assert.equal(itemComplete(bank, { rib: 'a', name: 'b' }), false);
    assert.equal(itemGiven(bank, { rib: 'a', name: 'b' }), true, 'but something did arrive');
  });

  it('is nothing at all when none of its fields was touched', () => {
    assert.equal(itemGiven(bank, {}), false);
    assert.equal(itemGiven(bank, null), false);
  });

  it('with nothing marked required, is complete as soon as anything is in it', () => {
    const loose = group('loose', [{ id: 'a', required: false }, { id: 'b', required: false }]);
    assert.equal(itemComplete(loose, { a: 'x' }), true);
    assert.equal(itemComplete(loose, {}), false);
  });
});

describe('repeatable — how many times it may occur', () => {
  const markets = deliverableItemSchema.parse({
    id: 'markets', type: 'short_text', label: 'Marchés', required: true, repeatable: true, each: 'marché',
  });
  const partners = group('partners', [{ id: 'nom' }, { id: 'cin' }], { repeatable: true, each: 'associé' });

  it('works on a plain field, with no group around it', async () => {
    assert.equal(itemEntries(markets, ['Maroc', 'Sénégal']).length, 2);
    assert.equal(itemComplete(markets, ['Maroc']), true);
    assert.equal(itemComplete(markets, []), false);
  });

  it('ignores entries nobody touched, so a stray Add blocks nothing', () => {
    assert.equal(itemEntries(partners, [{ nom: 'Benali', cin: 'f' }, {}, null]).length, 1);
    assert.equal(itemComplete(partners, [{ nom: 'Benali', cin: 'f' }, {}]), true);
  });

  it('is incomplete while one entry is short, and says how many', () => {
    /* Three associés of whom one has no CIN is not "two associés" — the file
       is incomplete, and the screen has to say it in words. */
    const three = [{ nom: 'A', cin: 'f' }, { nom: 'B' }, { nom: 'C', cin: 'f' }];
    assert.equal(itemComplete(partners, three), false);
    assert.equal(itemUnfinished(partners, three), 1);
    assert.equal(itemEntries(partners, three).length, 3, 'all three exist');
  });

  it('wants at least one when it is required', () => {
    assert.equal(itemComplete(partners, []), false);
    assert.equal(itemComplete(partners, [{ nom: 'A', cin: 'f' }]), true);
  });

  it('judges each entry on its own', () => {
    assert.equal(entryComplete(partners, { nom: 'A', cin: 'f' }), true);
    assert.equal(entryComplete(partners, { nom: 'A' }), false);
  });
});

describe('the files inside all that', () => {
  it('finds an upload however deep it sits', () => {
    /* A CIN now lives inside the third associé. A file this misses stays
       unattached to any candidacy — and who may open a file follows from the
       candidacy it belongs to, so a missed one is an access rule with nothing
       behind it. */
    const answers = {
      rc: { uploadId: 'up_1', filename: 'rc.pdf' },
      partners: [
        { nom: 'A', cin: { uploadId: 'up_2', filename: 'a.jpg' } },
        { nom: 'B', cin: { uploadId: 'up_3', filename: 'b.jpg' } },
      ],
      nothing: null,
    };
    assert.deepEqual(uploadIdsIn(Object.values(answers)).sort(), ['up_1', 'up_2', 'up_3']);
  });

  it('finds none where there are none', () => {
    assert.deepEqual(uploadIdsIn({ a: 'x', b: [1, 2] }), []);
  });
});
