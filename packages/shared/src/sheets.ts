/**
 * La fiche d'évaluation, telle qu'elle se sort en PDF.
 *
 * CEED's jurors mark on paper, and the paper is a known object: six families
 * of criteria, a mark circled from one to five on each line, a sub-total per
 * family and a global note. What comes back from the platform has to be the
 * same object, or the two cannot be filed together.
 *
 * So this builds the paper, filled in — one page per startup and juror — and
 * hands it to the browser to print. No library: a PDF writer that had to lay
 * out wrapping French sentences inside table cells would be a month of work to
 * arrive where `@page` and a print dialog already are.
 *
 * What the model carries and this does not: favourable or not, the signature,
 * the general comment. They were asked for on paper because paper cannot ask
 * twice; the platform holds the verdict and the comment where they are read.
 */
import { criterionMark, type EvaluationCriterion, type EvaluationScale } from './blocks.js';

export interface SheetSubject {
  /** The juror, as the panel names them. */
  juror: string;
  startup: string;
  /** The day they filed it, not the day it was printed. */
  on: string;
  marks: Record<string, number>;
  /** Their own score out of a hundred, as every screen already shows it. */
  overall: number | null;
}

export interface SheetGrid {
  /** The block this grid belongs to — printed at the top of every page. */
  name: string;
  criteria: EvaluationCriterion[];
  scale: EvaluationScale;
  markedOutOf: number;
}

const safe = (text: string): string =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** A day as a French form writes it. */
const day = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};

const round = (n: number): string => (Math.round(n * 10) / 10).toString().replace('.', ',');

/**
 * The scale, with the mark the juror gave standing out on it.
 *
 * Drawn the way they marked it: stars where they clicked stars, a ringed
 * number where the grid is numbered. A sheet that looks like the screen they
 * filled in is a sheet they can check at a glance — and the figure is written
 * out beside the stars, because counting five small shapes is exactly what
 * nobody should have to do on three hundred pages.
 *
 * Above ten steps the row would be a ladder, so the number stands alone.
 */
function marksRow(mark: number | null, outOf: number, scale: EvaluationScale): string {
  if (mark === null) return '<span class="plain">—</span>';
  const whole = Math.round(mark);

  if (scale === 'stars') {
    const stars = [];
    for (let i = 1; i <= outOf; i++) stars.push(`<span class="star${i <= whole ? ' on' : ''}">★</span>`);
    return `${stars.join('')}<span class="count">${round(mark)} / ${outOf}</span>`;
  }

  if (outOf > 10) return `<span class="plain">${round(mark)} / ${outOf}</span>`;
  const steps = [];
  for (let i = 1; i <= outOf; i++) steps.push(`<span class="dot${whole === i ? ' on' : ''}">${i}</span>`);
  return steps.join('');
}

/** One page: one startup, one juror, their marks and their total. */
function page(grid: SheetGrid, subject: SheetSubject): string {
  const outOf = grid.scale === 'stars' ? 5 : grid.markedOutOf;
  const rows: string[] = [];

  for (const family of grid.criteria) {
    const children = family.children.length ? family.children : [];
    const mark = criterionMark(family, subject.marks);
    rows.push(`<tr class="family">
      <th>${safe(family.label || 'Sans titre')}</th>
      <td class="sub">Sous-total : ${mark === null ? '—' : `${round(mark)} / ${outOf}`}</td>
    </tr>`);

    /* A family with no children is a criterion in its own right: it is marked
       on its own line rather than vanishing behind its own sub-total. */
    for (const leaf of children.length ? children : [family]) {
      const given = subject.marks[leaf.id];
      rows.push(`<tr>
        <td class="label">${safe(leaf.label || 'Sans titre')}</td>
        <td class="marks">${marksRow(typeof given === 'number' ? given : null, outOf, grid.scale)}</td>
      </tr>`);
    }
  }

  return `<article class="sheet">
    <h1>Grille d'évaluation${grid.name ? ` — ${safe(grid.name)}` : ''}</h1>
    <div class="who">
      <div><span>Juré</span><strong>${safe(subject.juror)}</strong></div>
      <div><span>Startup</span><strong>${safe(subject.startup)}</strong></div>
      <div><span>Date</span><strong>${safe(day(subject.on))}</strong></div>
    </div>
    <table>
      <thead><tr><th>Critères et sous-critères</th><th class="head-marks">Note / ${outOf}</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>
    <div class="total"><span>Note globale</span><strong>${
      subject.overall === null ? '—' : `${round(subject.overall)} / 100`
    }</strong></div>
  </article>`;
}

const STYLE = `
  @page { size: A4 portrait; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 10pt/1.35 "Helvetica Neue", Arial, sans-serif; color: #111; }
  .sheet { page-break-after: always; }
  .sheet:last-child { page-break-after: auto; }
  h1 { font-size: 14pt; margin: 0 0 8pt; }
  .who { display: flex; gap: 6pt; margin-bottom: 10pt; }
  .who > div { flex: 1; border: 0.6pt solid #999; padding: 5pt 7pt; }
  .who span { display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.4pt; color: #666; }
  .who strong { font-size: 10.5pt; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: #1a1a1a; color: #fff; text-align: left; padding: 5pt 7pt; font-size: 9pt; }
  thead th.head-marks { text-align: center; width: 42mm; }
  tr.family th { background: #ececec; text-align: left; padding: 5pt 7pt; font-size: 9.5pt; border: 0.6pt solid #bbb; }
  tr.family td.sub { background: #ececec; text-align: right; padding: 5pt 7pt; font-size: 9pt;
    border: 0.6pt solid #bbb; white-space: nowrap; }
  td.label { padding: 4pt 7pt; border: 0.6pt solid #ccc; }
  td.marks { padding: 4pt 7pt; border: 0.6pt solid #ccc; text-align: center; white-space: nowrap; }
  .dot { display: inline-block; width: 13pt; height: 13pt; line-height: 12pt; margin: 0 1.5pt;
    border: 0.6pt solid #888; border-radius: 50%; font-size: 8pt; text-align: center; color: #666; }
  .dot.on { background: #111; border-color: #111; color: #fff; font-weight: 700; }
  .star { display: inline-block; font-size: 12pt; line-height: 1; margin: 0 0.5pt; color: #c9c9c9; }
  .star.on { color: #111; }
  .count { margin-left: 6pt; font-size: 9pt; color: #444; }
  .plain { font-size: 10pt; }
  .total { margin-top: 10pt; display: inline-block; border: 0.8pt solid #111; padding: 6pt 12pt; }
  .total span { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.4pt; color: #666; margin-right: 10pt; }
  .total strong { font-size: 13pt; }
`;

/** The whole document, ready for a print dialog. */
export function sheetsDocument(grid: SheetGrid, subjects: SheetSubject[]): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
    <title>${safe(grid.name || 'Grilles')} — fiches d'évaluation</title>
    <style>${STYLE}</style></head>
    <body>${subjects.map((s) => page(grid, s)).join('')}</body></html>`;
}

