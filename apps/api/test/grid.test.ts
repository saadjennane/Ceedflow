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
  criterionMark,
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

describe("a criterion's own mark", () => {
  /* The shape the screens draw: a heading that carries a share, and the points
     to consider under it. What the juror marks is the points; what counts is
     the heading. */
  const withChildren = (marks: Record<string, number>) =>
    criterionMark(
      {
        id: 'mkt', label: 'Marché', help: '', share: 19, weight: 1, max: 5,
        children: [
          { id: 'a', label: 'Défini ?', help: '', share: null, weight: 1, max: 5, children: [] },
          { id: 'b', label: 'Assez grand ?', help: '', share: null, weight: 1, max: 5, children: [] },
          { id: 'c', label: 'Des clients ?', help: '', share: null, weight: 1, max: 5, children: [] },
        ],
      },
      marks,
    );

  it('is the plain average of what was marked under it', () => {
    assert.equal(withChildren({ a: 4, b: 3, c: 5 }), 4);
  });

  it('averages what is there rather than counting a blank as a zero', () => {
    // Two fives and an unanswered question is five, not three and a third.
    assert.equal(withChildren({ a: 5, b: 5 }), 5);
  });

  it('is nothing at all while nothing under it has been marked', () => {
    // A dash on screen, not a zero: the question has not been answered yet.
    assert.equal(withChildren({}), null);
  });

  it('is the criterion itself when it has no sub-criteria', () => {
    const plain = { id: 'esg', label: 'Impact', help: '', share: 5, weight: 1, max: 5, children: [] };
    assert.equal(criterionMark(plain, { esg: 3 }), 3);
    assert.equal(criterionMark(plain, {}), null);
  });
});

describe('what the setup shows against a criterion', () => {
  /* Five at nineteen and one at five is a hundred exactly. The screen used to
     print the sum of its sub-criteria's rounded shares instead, which turned
     that hundred into a hundred and one: nineteen over three rounds to six
     three times (eighteen), over four to five four times (twenty), over two to
     ten twice (twenty). Rounding once, at the end, is the whole fix. */
  const six = [
    { id: 'a', label: 'Marché', help: '', share: 19, weight: 1, max: 5, children: kids('a', 3) },
    { id: 'b', label: 'Innovation', help: '', share: 19, weight: 1, max: 5, children: kids('b', 4) },
    { id: 'c', label: 'Scalabilité', help: '', share: 19, weight: 1, max: 5, children: kids('c', 3) },
    { id: 'd', label: 'Équipe', help: '', share: 19, weight: 1, max: 5, children: kids('d', 2) },
    { id: 'e', label: 'Maturité', help: '', share: 19, weight: 1, max: 5, children: kids('e', 4) },
    { id: 'f', label: 'Impact', help: '', share: 5, weight: 1, max: 5, children: kids('f', 1) },
  ];

  it('gives each criterion the share that was typed', () => {
    const shares = criterionShares(six);
    assert.deepEqual(
      six.map((c) => Math.round(shares.get(c.id) ?? 0)),
      [19, 19, 19, 19, 19, 5],
    );
  });

  it('adds up to a hundred, whatever the sub-criteria count', () => {
    const shares = criterionShares(six);
    const total = six.reduce((n, c) => n + Math.round(shares.get(c.id) ?? 0), 0);
    assert.equal(total, 100, 'six criteria must not add up to a hundred and one');
  });

  it('still spreads the whole mark across the leaves', () => {
    // The arithmetic underneath is untouched: it was only ever the display.
    const total = gridLeaves(six).reduce((n, l) => n + l.weight, 0);
    assert.ok(Math.abs(total - 100) < 1e-9, `leaves carry ${total}`);
  });
});

/** n sub-criteria under one criterion, which is all these tests need of them. */
function kids(prefix: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`, label: `Point ${i + 1}`, help: '', share: null, weight: 1, max: 5, children: [],
  }));
}
