/**
 * La fiche d'évaluation, mesurée puis récupérée.
 *
 * The document is built in `@ceed/shared` — it is the grid on paper, and the
 * grid is domain vocabulary. Two things only a browser can do are left here:
 * say how wide a sentence runs, which is what a layout needs before it can
 * break a line, and hand the finished file to somebody.
 */
import { sheetsPdf, type Measure, type SheetGrid, type SheetSubject } from '@ceed/shared';
import { download } from './xlsx';

/**
 * Helvetica, measured by whatever is about to draw it.
 *
 * A canvas measured at `size` pixels gives the advance of the same text at
 * `size` points: a font's widths are proportional to its em, whatever the unit
 * is called. And on a machine with no Helvetica, Arial stands in — which was
 * drawn to the same widths, so the layout does not move.
 */
const measure: Measure = (() => {
  const canvas = document.createElement('canvas');
  const pen = canvas.getContext('2d');
  return (text, size, bold) => {
    if (!pen) return text.length * size * 0.5;
    pen.font = `${bold ? 'bold ' : ''}${size}px Helvetica, Arial, sans-serif`;
    return pen.measureText(text).width;
  };
})();

/** Writes the file and gives it to them. */
export function downloadSheets(grid: SheetGrid, subjects: SheetSubject[]): void {
  const bytes = sheetsPdf(grid, subjects, measure);
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
  const name = `${grid.name || 'Fiches'} — fiches d'évaluation.pdf`.replace(/[/\\:*?"<>|]/g, '-');
  download(blob, name);
}
