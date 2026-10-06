/**
 * La fiche d'évaluation imprimée.
 *
 * CEED files these beside the paper ones their jurors sign, so what comes out
 * has to be the same object: the families in order, every sub-criterion on its
 * own line, the mark ringed where the juror put it, a sub-total per family and
 * one global note. The checks below are about that resemblance — and about the
 * three things the paper asks for that this deliberately does not.
 *
 * No server: the document is a pure function of a grid and some marks.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sheetsDocument, type EvaluationCriterion } from '@ceed/shared';

const GRID: EvaluationCriterion[] = [
  {
    id: 'marche', label: 'Adéquation problématique/solution', help: '', share: null,
    children: [
      { id: 'cible', label: 'Le marché cible est-il bien défini ?', help: '', share: null },
      { id: 'taille', label: 'La taille du marché est-elle suffisante ?', help: '', share: null },
    ],
  },
  {
    id: 'equipe', label: 'Maîtrise du projet : Équipe fondatrice', help: '', share: null,
    children: [{ id: 'compet', label: 'Les fondateurs ont-ils les compétences ?', help: '', share: null }],
  },
];

const grid = { name: 'Jury Day', criteria: GRID, scale: 'points' as const, markedOutOf: 5 };

const one = (marks: Record<string, number>, overall: number | null = 70) =>
  sheetsDocument(grid, [
    { juror: 'Ghita Alami', startup: 'Rafid Tech', on: '2026-09-28T10:00:00Z', marks, overall },
  ]);

describe('an evaluation sheet', () => {
  it('carries the juror, the startup and the day they filed it', () => {
    const html = one({ cible: 4, taille: 3, compet: 5 });
    assert.match(html, /Ghita Alami/);
    assert.match(html, /Rafid Tech/);
    assert.match(html, /28 septembre 2026/, 'the day it was marked, not the day it was printed');
    assert.match(html, /Jury Day/, 'and which grid it is');
  });

  it('keeps the families and their sub-criteria, in the order of the grid', () => {
    const html = one({ cible: 4, taille: 3, compet: 5 });
    const at = (needle: string) => html.indexOf(needle);
    assert.ok(at('Adéquation probl') < at('Le marché cible'), 'a family above what it holds');
    assert.ok(at('Le marché cible') < at('La taille du marché'), 'and the lines in their order');
    assert.ok(at('La taille du marché') < at('Maîtrise du projet'), 'then the next family');
  });

  it('rings the mark the juror gave, and only that one', () => {
    const html = one({ cible: 4 });
    const row = html.slice(html.indexOf('Le marché cible'), html.indexOf('La taille du marché'));
    assert.match(row, /<span class="dot on">4<\/span>/, 'four is ringed');
    assert.equal((row.match(/dot on/g) ?? []).length, 1, 'and nothing else is');
    assert.equal((row.match(/class="dot/g) ?? []).length, 5, 'the whole scale is drawn, as on paper');
  });

  it('says a sub-total per family, and the global note', () => {
    const html = one({ cible: 4, taille: 3, compet: 5 }, 76.5);
    assert.match(html, /Sous-total : 3,5 \/ 5/, 'the average of four and three');
    assert.match(html, /Sous-total : 5 \/ 5/);
    assert.match(html, /76,5 \/ 100/, 'the same number every screen shows');
  });

  it('draws stars where the juror saw stars, and writes the count beside them', () => {
    /* « Je veux voir le nombre d'étoiles sélectionnées » : compter cinq petites
       formes est exactement ce que personne ne doit faire sur trois cents
       pages. */
    const starred = { ...grid, scale: 'stars' as const };
    const html = sheetsDocument(starred, [
      { juror: 'Ghita', startup: 'Rafid Tech', on: '2026-09-28', marks: { cible: 4 }, overall: 80 },
    ]);
    const row = html.slice(html.indexOf('Le marché cible'), html.indexOf('La taille du marché'));
    assert.equal((row.match(/class="star on"/g) ?? []).length, 4, 'four filled');
    assert.equal((row.match(/class="star"/g) ?? []).length, 1, 'and one empty');
    assert.match(row, /class="count">4 \/ 5</, 'with the figure written out');
    assert.doesNotMatch(row, /class="dot/, 'and no numbered circle, which is the other grid');
  });

  it('leaves a dash where nobody marked, rather than a nought', () => {
    /* Zéro est une note. Rien n'en est pas une, et les deux ne se lisent pas
       pareil sur une fiche qu'on classe. */
    const html = one({}, null);
    assert.match(html, /Sous-total : —/);
    assert.match(html, /<strong>—<\/strong>/);
    assert.doesNotMatch(html, /dot on/, 'and no mark is ringed');
  });

  it('leaves out what the paper only asked because paper cannot ask twice', () => {
    const html = one({ cible: 4 });
    assert.doesNotMatch(html, /Favorable|Défavorable/i);
    assert.doesNotMatch(html, /Signature/i);
    assert.doesNotMatch(html, /Commentaire/i);
  });

  it('gives each pair its own page', () => {
    const html = sheetsDocument(grid, [
      { juror: 'Ghita', startup: 'Rafid Tech', on: '2026-09-28', marks: { cible: 4 }, overall: 70 },
      { juror: 'Ali', startup: 'Rafid Tech', on: '2026-09-28', marks: { cible: 2 }, overall: 40 },
    ]);
    assert.equal((html.match(/class="sheet"/g) ?? []).length, 2);
    assert.match(html, /page-break-after: always/, 'and a break between them');
  });

  it('escapes a name that would otherwise break the page', () => {
    const html = sheetsDocument(grid, [
      { juror: 'A <script>alert(1)</script>', startup: 'R&D "Co"', on: '2026-09-28', marks: {}, overall: null },
    ]);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /R&amp;D &quot;Co&quot;/);
  });
});
