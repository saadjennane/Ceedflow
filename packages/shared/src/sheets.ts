/**
 * La fiche d'évaluation, telle qu'elle se récupère en PDF.
 *
 * CEED's jurors mark on paper, and the paper is a known object: six families
 * of criteria, a mark on each line, a sub-total per family and a global note.
 * What comes back from the platform has to be the same object, or the two
 * cannot be filed together.
 *
 * So this draws the paper, filled in — one page per startup and juror — into a
 * file somebody keeps, rather than into a print dialog they have to answer.
 *
 * What the model carries and this does not: favourable or not, the signature,
 * the general comment. They were asked for on paper because paper cannot ask
 * twice; the platform holds the verdict and the comment where they are read.
 */
import { criterionMark, type EvaluationCriterion, type EvaluationScale } from './blocks.js';
import { Pdf, wrap, type Measure, type Page } from './pdf.js';

export interface SheetSubject {
  /** The juror, as the panel names them. */
  juror: string;
  startup: string;
  /** The day they filed it, not the day it was exported. */
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

const MARGIN = 40;
const MARKS_COLUMN = 150;
const LEADING = 11.5;

/** A day as a French form writes it. */
const day = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

const round = (v: number): string => (Math.round(v * 10) / 10).toString().replace('.', ',');

/** What one sheet is drawn on, and where the pen has got to. */
interface Pen {
  pdf: Pdf;
  page: Page;
  y: number;
  width: number;
}

/** The table's own head, redrawn whenever a sheet runs onto a second page. */
function tableHead(pen: Pen, outOf: number): void {
  pen.page.rect({ x: MARGIN, y: pen.y, w: pen.width, h: 18 }, { fill: 0.1 });
  pen.page.text(MARGIN + 7, pen.y + 12.5, 'Critères et sous-critères', { size: 9, bold: true, grey: 1 });
  pen.page.text(MARGIN + pen.width - MARKS_COLUMN + 7, pen.y + 12.5, `Note / ${outOf}`, {
    size: 9, bold: true, grey: 1,
  });
  pen.y += 18;
}

/** Starts a new page when the next row would run off this one. */
function room(pen: Pen, needed: number, outOf: number): void {
  if (pen.y + needed <= pen.pdf.height - MARGIN) return;
  pen.page = pen.pdf.page();
  pen.y = MARGIN;
  tableHead(pen, outOf);
}

/**
 * The mark the juror gave, drawn the way they gave it.
 *
 * Stars where they clicked stars, with the figure written out beside them —
 * counting five small shapes is exactly what nobody should have to do on three
 * hundred pages. A numbered grid says the number, which is already the thing.
 */
function marks(pen: Pen, x: number, mark: number | null, outOf: number, scale: EvaluationScale): void {
  const baseline = pen.y + 11.5;
  if (mark === null) {
    pen.page.text(x, baseline, '—', { size: 9.5, grey: 0.45 });
    return;
  }
  if (scale !== 'stars' || outOf > 10) {
    pen.page.text(x, baseline, `${round(mark)} / ${outOf}`, { size: 9.5 });
    return;
  }
  const whole = Math.round(mark);
  for (let i = 0; i < outOf; i++) pen.page.star(x + i * 12, pen.y + 3.5, 10.5, i < whole);
  pen.page.text(x + outOf * 12 + 6, baseline, `${round(mark)} / ${outOf}`, { size: 8.5, grey: 0.3 });
}

/** One page — or two, for a grid long enough: one startup, one juror. */
function sheet(pdf: Pdf, grid: SheetGrid, subject: SheetSubject, measure: Measure): void {
  const width = pdf.width - MARGIN * 2;
  const pen: Pen = { pdf, page: pdf.page(), y: MARGIN, width };
  const outOf = grid.scale === 'stars' ? 5 : grid.markedOutOf;

  pen.page.text(MARGIN, pen.y + 12, `Grille d'évaluation${grid.name ? ` — ${grid.name}` : ''}`, {
    size: 13.5, bold: true,
  });
  pen.y += 26;

  // Juré, startup, date — three boxes across, as on the form.
  const cells: [string, string][] = [
    ['JURÉ', subject.juror],
    ['STARTUP', subject.startup],
    ['DATE', day(subject.on)],
  ];
  const cellWidth = (width - 12) / 3;
  for (const [i, [label, value]] of cells.entries()) {
    const x = MARGIN + i * (cellWidth + 6);
    pen.page.rect({ x, y: pen.y, w: cellWidth, h: 34 }, { stroke: 0.6 });
    pen.page.text(x + 7, pen.y + 13, label, { size: 7, grey: 0.4 });
    pen.page.text(x + 7, pen.y + 26, value, { size: 10.5, bold: true });
  }
  pen.y += 44;

  tableHead(pen, outOf);

  const labelWidth = width - MARKS_COLUMN - 14;
  for (const family of grid.criteria) {
    const mark = criterionMark(family, subject.marks);
    room(pen, 17, outOf);
    pen.page.rect({ x: MARGIN, y: pen.y, w: width, h: 17 }, { fill: 0.92, stroke: 0.72 });
    pen.page.text(MARGIN + 7, pen.y + 12, family.label || 'Sans titre', { size: 9.5, bold: true });
    pen.page.text(
      MARGIN + width - MARKS_COLUMN + 7,
      pen.y + 12,
      `Sous-total : ${mark === null ? '—' : `${round(mark)} / ${outOf}`}`,
      { size: 8.5 },
    );
    pen.y += 17;

    /* A family with no children is a criterion in its own right: it is marked
       on its own line rather than vanishing behind its own sub-total. */
    for (const leaf of family.children.length ? family.children : [family]) {
      const lines = wrap(leaf.label || 'Sans titre', labelWidth, 9, false, measure);
      const height = Math.max(17, lines.length * LEADING + 6);
      room(pen, height, outOf);
      pen.page.rect({ x: MARGIN, y: pen.y, w: width, h: height }, { stroke: 0.8 });
      for (const [i, line] of lines.entries()) {
        pen.page.text(MARGIN + 7, pen.y + 11.5 + i * LEADING, line, { size: 9 });
      }
      const given = subject.marks[leaf.id];
      marks(pen, MARGIN + width - MARKS_COLUMN + 7, typeof given === 'number' ? given : null, outOf, grid.scale);
      pen.y += height;
    }
  }

  room(pen, 40, outOf);
  pen.y += 12;
  pen.page.rect({ x: MARGIN, y: pen.y, w: 190, h: 28 }, { stroke: 0.1, width: 0.9 });
  pen.page.text(MARGIN + 10, pen.y + 18, 'NOTE GLOBALE', { size: 7.5, grey: 0.4 });
  pen.page.text(
    MARGIN + 92,
    pen.y + 19,
    subject.overall === null ? '—' : `${round(subject.overall)} / 100`,
    { size: 13, bold: true },
  );
}

/** Every sheet, as the bytes of one file. */
export function sheetsPdf(grid: SheetGrid, subjects: SheetSubject[], measure: Measure): Uint8Array {
  const pdf = new Pdf();
  for (const subject of subjects) sheet(pdf, grid, subject, measure);
  if (!subjects.length) pdf.page();
  return pdf.bytes();
}

/** The same, as each page's drawing instructions — which is what a test reads. */
export function sheetPages(grid: SheetGrid, subjects: SheetSubject[], measure: Measure): string[] {
  const pdf = new Pdf();
  for (const subject of subjects) sheet(pdf, grid, subject, measure);
  return pdf.pages.map((p) => p.stream());
}
