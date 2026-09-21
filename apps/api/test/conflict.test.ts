/**
 * Nobody judges their own company.
 *
 * A jury in a small ecosystem is drawn from the same people who found
 * startups, so this is not a rare case — it is Tuesday. The rule is quiet by
 * design: the startup simply is not on the juror's list, with no line
 * explaining why, because explaining it would tell them a conflict exists.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { conflicted } from '../src/services/reviews.js';

const JUROR = 'rec_juror';
const THEIR_ORG = 'rec_kettara';
const SOMEBODY_ELSE = 'rec_other';

describe('who a juror may not judge', () => {
  it('leaves out the startup they founded', () => {
    assert.equal(
      conflicted({ personId: SOMEBODY_ELSE, orgId: THEIR_ORG }, JUROR, new Set([THEIR_ORG])),
      true,
    );
  });

  it('leaves out a candidacy filed in their own name', () => {
    assert.equal(conflicted({ personId: JUROR, orgId: null }, JUROR, new Set()), true);
  });

  it('leaves out a company they merely belong to, not only the one they lead', () => {
    // Affiliation is the test, not the title: an advisor with a stake is as
    // conflicted as a founder.
    assert.equal(conflicted({ personId: null, orgId: THEIR_ORG }, JUROR, new Set([THEIR_ORG])), true);
  });

  it('keeps everybody else', () => {
    assert.equal(
      conflicted({ personId: SOMEBODY_ELSE, orgId: 'rec_elsewhere' }, JUROR, new Set([THEIR_ORG])),
      false,
    );
  });

  it('keeps a candidacy with no organisation behind it', () => {
    assert.equal(conflicted({ personId: SOMEBODY_ELSE, orgId: null }, JUROR, new Set([THEIR_ORG])), false);
  });
});
