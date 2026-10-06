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
import { sheetPages, sheetsPdf, type EvaluationCriterion, type Measure } from '@ceed/shared';

/* Les largeurs viennent du navigateur en vrai. Ici, une règle fixe : ce qu'on
   vérifie est la mise en page, pas la fonte. */
const measure: Measure = (text, size, bold) => text.length * size * (bold ? 0.56 : 0.5);

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

/** Everything a page actually writes, with the bytes read back as letters. */
const texts = (stream: string): string[] =>
  [...stream.matchAll(/\((.*?)\) Tj/g)].map((m) =>
    m[1]!
      /* Les octets 0x80–0x9F de WinAnsi ne sont pas ceux d'Unicode : c'est là
         que CP1252 range la ponctuation française. */
      .replace(/\\(\d{3})/g, (_, octal: string) => {
        const byte = parseInt(octal, 8);
        const high: Record<number, string> = { 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201c',
          0x94: '\u201d', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014', 0x85: '\u2026' };
        return high[byte] ?? String.fromCharCode(byte);
      })
      .replace(/\\([()\\])/g, '$1'),
  );

/** The drawing instructions of the one page a single subject makes. */
const one = (marks: Record<string, number>, overall: number | null = 70) =>
  sheetPages(grid, [
    { juror: 'Ghita Alami', startup: 'Rafid Tech', on: '2026-09-28T10:00:00Z', marks, overall },
  ], measure).join('\n');

describe('an evaluation sheet', () => {
  it('carries the juror, the startup and the day they filed it', () => {
    const html = texts(one({ cible: 4, taille: 3, compet: 5 })).join('\n');
    assert.match(html, /Ghita Alami/);
    assert.match(html, /Rafid Tech/);
    assert.match(html, /28 septembre 2026/, 'the day it was marked, not the day it was exported');
    assert.match(html, /Jury Day/, 'and which grid it is');
  });

  it('keeps the families and their sub-criteria, in the order of the grid', () => {
    const html = texts(one({ cible: 4, taille: 3, compet: 5 })).join('\n');
    const at = (needle: string) => html.indexOf(needle);
    assert.ok(at('Adéquation probl') < at('Le marché cible'), 'a family above what it holds');
    assert.ok(at('Le marché cible') < at('La taille du marché'), 'and the lines in their order');
    assert.ok(at('La taille du marché') < at('Maîtrise du projet'), 'then the next family');
  });

  it('writes the mark the juror gave, beside the line they gave it on', () => {
    const lines = texts(one({ cible: 4 }));
    const at = lines.findIndex((t) => t.startsWith('Le marché cible'));
    assert.ok(at > 0, 'the line is there');
    assert.equal(lines[at + 1], '4 / 5', 'and its mark comes right after it');
  });

  it('keeps the punctuation a French sentence is written with', () => {
    /* `L'innovation` tapé avec une apostrophe typographique perdait son
       apostrophe : WinAnsi la range au-dessus de Latin-1, et rien ne l'y
       cherchait. */
    const page = sheetPages(
      { ...grid, criteria: [{ id: 'g', label: 'Caractère innovant', help: '', share: null,
        children: [{ id: 'k', label: 'L\u2019innovation est-elle brevetée — ou pourrait-elle l\u2019être ?', help: '', share: null }] }] },
      [{ juror: 'G', startup: 'R', on: '2026-09-28', marks: { k: 5 }, overall: 90 }],
      measure,
    ).join('\n');
    assert.ok(texts(page).some((t) => t.includes('\u2019innovation')), 'the apostrophe survives');
    assert.ok(texts(page).some((t) => t.includes('\u2014')), 'and so does the dash');
  });

  it('says a sub-total per family, and the global note', () => {
    const html = texts(one({ cible: 4, taille: 3, compet: 5 }, 76.5)).join('\n');
    assert.match(html, /Sous-total : 3,5 \/ 5/, 'the average of four and three');
    assert.match(html, /Sous-total : 5 \/ 5/);
    assert.match(html, /76,5 \/ 100/, 'the same number every screen shows');
  });

  it('draws stars where the juror saw stars, and writes the count beside them', () => {
    /* « Je veux voir le nombre d'étoiles sélectionnées » : compter cinq petites
       formes est exactement ce que personne ne doit faire sur trois cents
       pages. */
    const starred = { ...grid, scale: 'stars' as const };
    const page = sheetPages(starred, [
      { juror: 'Ghita', startup: 'Rafid Tech', on: '2026-09-28', marks: { cible: 4 }, overall: 80 },
    ], measure).join('\n');
    const row = page.slice(page.indexOf('Le march'), page.indexOf('La taille du march'));
    // Une étoile est un chemin : quatre pleines, puis une creuse.
    const greys = [...row.matchAll(/(0\.07|0\.78) \1 \1 rg/g)].map((m) => m[1]);
    assert.deepEqual(greys, ['0.07', '0.07', '0.07', '0.07', '0.78'], 'four filled, then one empty');
    assert.match(row, /\(4 \/ 5\) Tj/, 'with the figure written out beside them');
  });

  it('leaves a dash where nobody marked, rather than a nought', () => {
    /* Zéro est une note. Rien n'en est pas une, et les deux ne se lisent pas
       pareil sur une fiche qu'on classe. */
    const page = texts(one({}, null));
    assert.ok(page.some((t) => t === 'Sous-total : —'), 'no sub-total where there are no marks');
    assert.ok(page.some((t) => t === '—'), 'and no global note either');
  });

  it('leaves out what the paper only asked because paper cannot ask twice', () => {
    const page = texts(one({ cible: 4 })).join('\n');
    assert.doesNotMatch(page, /Favorable|Défavorable/i);
    assert.doesNotMatch(page, /Signature/i);
    assert.doesNotMatch(page, /Commentaire/i);
  });

  it('gives each pair its own page', () => {
    const pages = sheetPages(grid, [
      { juror: 'Ghita', startup: 'Rafid Tech', on: '2026-09-28', marks: { cible: 4 }, overall: 70 },
      { juror: 'Ali', startup: 'Rafid Tech', on: '2026-09-28', marks: { cible: 2 }, overall: 40 },
    ], measure);
    assert.equal(pages.length, 2);
    assert.match(pages[0]!, /\(Ghita\) Tj/);
    assert.match(pages[1]!, /\(Ali\) Tj/);
  });

  it('writes a file a reader will open', () => {
    /* Un PDF tient par ses décalages d'octets : ce sont eux qui font un
       fichier plutôt qu'un texte qui y ressemble. */
    const bytes = sheetsPdf(grid, [
      { juror: 'Ghita', startup: 'Rafid Tech', on: '2026-09-28', marks: { cible: 4 }, overall: 70 },
    ], measure);
    const file = Buffer.from(bytes).toString('latin1');
    assert.match(file, /^%PDF-1\.4\n/, 'it says what it is');
    assert.match(file, /%%EOF\n$/, 'and where it ends');
    assert.match(file, /\/Type \/Catalog/);
    assert.match(file, /\/Type \/Pages \/Count 1/);

    // Chaque décalage de la table doit tomber sur le début de son objet.
    const start = Number(file.slice(file.lastIndexOf('startxref') + 9).trim().split('\n')[0]);
    const table = file.slice(start);
    assert.match(table, /^xref\n0 /, 'the table is where the trailer says');
    const rows = [...table.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    assert.ok(rows.length >= 5, 'one row per object');
    for (const [i, offset] of rows.entries()) {
      assert.match(file.slice(offset, offset + 12), new RegExp(`^${i + 1} 0 obj`), `object ${i + 1} is where it says`);
    }
  });

  it('writes an accent as a byte a reader understands, and drops what it cannot', () => {
    const page = sheetPages(grid, [
      { juror: 'Ghita Chérif (Casa)', startup: 'Rafid', on: '2026-09-28', marks: {}, overall: null },
    ], measure).join('\n');
    assert.match(page, /Ch\\351rif/, 'é is written as its WinAnsi byte');
    assert.match(page, /\\\(Casa\\\)/, 'and a bracket is escaped rather than closing the string');
  });

  it('wraps a long criterion rather than letting it run off the page', () => {
    const long = 'Les premiers clients ont-ils eu un impact significatif et mesurable sur '
      + "l'augmentation du chiffre d'affaires de la startup depuis son lancement ?";
    const page = sheetPages(
      { ...grid, criteria: [{ id: 'g', label: 'Marché', help: '', share: null,
        children: [{ id: 'long', label: long, help: '', share: null }] }] },
      [{ juror: 'G', startup: 'R', on: '2026-09-28', marks: { long: 3 }, overall: 60 }],
      measure,
    ).join('\n');
    const drawn = [...page.matchAll(/\(([^)]*)\) Tj/g)].map((m) => m[1]!);
    const parts = drawn.filter((t) => long.includes(t) && t.length > 10);
    assert.ok(parts.length > 1, 'the sentence is cut into lines');
    assert.equal(parts.join(' '), long, 'and nothing is lost in the cutting');
  });
});
