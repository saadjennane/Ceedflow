/**
 * What a grid is worth.
 *
 * These are the numbers a jury's decision comes out of, so an error here is
 * one nobody notices: the screen still shows a score, it is simply the wrong
 * one. Nothing below touches a database — this is arithmetic, and it should
 * fail in milliseconds when somebody changes it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  criterionShares,
  gridLeaves,
  normalisedScore,
  parseBlockConfig,
  sharesLeft,
  sharesOver,
  type EvaluationCriterion,
} from '@ceed/shared';

const crit = (id: string, share: number | null = null, children: EvaluationCriterion[] = []) =>
  ({ id, label: id, help: '', share, weight: 1, max: 10, children }) as EvaluationCriterion;

describe('how much each criterion counts', () => {
  it('shares a hundred equally when nobody has weighted anything', () => {
    const shares = criterionShares([crit('a'), crit('b'), crit('c'), crit('d')]);
    assert.deepEqual([...shares.values()], [25, 25, 25, 25]);
  });

  it('leaves the rest to be shared by the ones left blank', () => {
    const grid = [crit('a', 30), crit('b'), crit('c'), crit('d')];
    const shares = criterionShares(grid);
    assert.equal(shares.get('a'), 30);
    assert.ok(Math.abs((shares.get('b') ?? 0) - 70 / 3) < 0.01);
    assert.deepEqual(sharesLeft(grid), { left: 70, among: 3 });
  });

  it('scales back to a hundred rather than refusing a grid that overshoots', () => {
    const grid = [crit('a', 70), crit('b', 60)];
    assert.equal(sharesOver(grid), 30);
    const total = [...criterionShares(grid).values()].reduce((n, v) => n + v, 0);
    assert.ok(Math.abs(total - 100) < 0.01);
  });

  it('leaves nothing to a criterion when the others took it all', () => {
    const grid = [crit('a', 100), crit('b')];
    assert.equal(sharesLeft(grid)?.left, 0);
    assert.equal(criterionShares(grid).get('b'), 0);
  });
});

describe('the scale decides nothing, the share decides everything', () => {
  it('gives the same result whatever the grid is marked out of', () => {
    const grid = [crit('team', 75), crit('market', 25)];
    assert.equal(normalisedScore({ team: 10, market: 0 }, gridLeaves(grid, 10)), 75);
    assert.equal(normalisedScore({ team: 20, market: 0 }, gridLeaves(grid, 20)), 75);
  });

  it('weights the result by the share', () => {
    const even = gridLeaves([crit('team'), crit('market')], 10);
    assert.equal(normalisedScore({ team: 10, market: 0 }, even), 50);
  });

  it('scores on what was marked when a sheet is only half filled', () => {
    const grid = gridLeaves([crit('a'), crit('b'), crit('c'), crit('d')], 10);
    assert.equal(normalisedScore({ a: 10 }, grid), 100);
    assert.equal(normalisedScore({}, grid), null);
  });
});

describe('a sub-criterion averages into its criterion', () => {
  it('splits the parent between its children and takes their mean', () => {
    const grid = [crit('team', 50, [crit('compl'), crit('commit')]), crit('market', 50)];
    const leaves = gridLeaves(grid, 10);
    assert.deepEqual(
      leaves.map((l) => l.weight),
      [25, 25, 50],
    );
    // 8 and 6 average to 7 out of 10 over half the grid; nothing on the rest.
    assert.equal(normalisedScore({ compl: 8, commit: 6, market: 0 }, leaves), 35);
  });
});

describe('a grid written before the scale moved onto the block', () => {
  it('keeps deciding the same way', () => {
    const old = parseBlockConfig('evaluation', {
      method: 'score',
      criteria: [
        { id: 'a', label: 'A', help: '', weight: 2, max: 10, children: [] },
        { id: 'b', label: 'B', help: '', weight: 1, max: 10, children: [] },
      ],
    }) as { criteria: EvaluationCriterion[]; markedOutOf: number };

    assert.equal(old.markedOutOf, 10);
    // The old relative weights become the shares they amounted to. Leaving them
    // behind would quietly flatten a grid where one thing counted twice.
    assert.deepEqual(
      old.criteria.map((c) => c.share),
      [66.7, 33.3],
    );
    const before = normalisedScore({ a: 9, b: 3 }, [
      { id: 'a', label: 'A', help: '', share: null, weight: 2, max: 10 },
      { id: 'b', label: 'B', help: '', share: null, weight: 1, max: 10 },
    ]);
    const after = normalisedScore({ a: 9, b: 3 }, gridLeaves(old.criteria, old.markedOutOf));
    assert.ok(Math.abs((before ?? 0) - (after ?? 0)) < 0.1);
  });

  it('reads equal weights as equal, not as shares to write down', () => {
    const uniform = parseBlockConfig('evaluation', {
      method: 'score',
      criteria: [
        { id: 'a', label: 'A', help: '', weight: 1, max: 5, children: [] },
        { id: 'b', label: 'B', help: '', weight: 1, max: 5, children: [] },
      ],
    }) as { criteria: EvaluationCriterion[]; markedOutOf: number };
    assert.equal(uniform.markedOutOf, 5);
    assert.deepEqual(uniform.criteria.map((c) => c.share), [null, null]);
  });

  it('makes stars a scale of five, whatever the grid says', () => {
    const stars = parseBlockConfig('evaluation', {
      method: 'score',
      scale: 'stars',
      markedOutOf: 10,
      criteria: [{ id: 'a', label: 'A', help: '', weight: 1, max: 10, children: [] }],
    }) as { markedOutOf: number };
    // Five stars used to be worth fifty out of a hundred.
    assert.equal(stars.markedOutOf, 5);
  });
});
