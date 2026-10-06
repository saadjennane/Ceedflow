/**
 * Un PDF, écrit à la main.
 *
 * The browser will only ever hand a PDF to a print dialog, and what CEED needs
 * is the file — one they file beside the paper sheets their jurors signed. So
 * the file is written here, the way the spreadsheet already is: no dependency,
 * a format we own, and only the small part of it this actually uses.
 *
 * That small part: two base-14 fonts, which every reader has and nothing has
 * to embed; rectangles and lines; text in WinAnsi, which covers every accent
 * French needs; and filled paths, for the one glyph that is not in WinAnsi and
 * matters anyway — a star.
 *
 * Widths come from outside. A layout engine needs to know how wide a sentence
 * is before it can decide where to break it, and the one honest source for
 * that is whatever will draw it — a canvas in the browser, measuring the same
 * Helvetica this file names. Passing it in also makes the layout testable,
 * which a module that measured things itself would not be.
 */

/** Points, with the origin where a reader expects it: the top left. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextStyle {
  size?: number;
  bold?: boolean;
  /** 0 is black, 1 is white. */
  grey?: number;
}

/** How wide this text runs, in points, at that size and weight. */
export type Measure = (text: string, size: number, bold: boolean) => number;

const A4 = { width: 595.28, height: 841.89 };

/**
 * Ce que WinAnsi range au-dessus de Latin-1.
 *
 * CP1252 fills the block Latin-1 leaves empty with the punctuation a French
 * sentence actually uses: a typographic apostrophe, an em dash, quotation
 * marks. Without this table `L'innovation` loses its apostrophe to a space —
 * and that is not an edge case, it is how a criterion gets typed.
 */
const WINANSI: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

/** Escapes one string into a PDF literal, in WinAnsi bytes. */
function literal(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`;
    else if (code < 32) out += ' ';
    else if (code < 128) out += ch;
    else if (code < 256 || WINANSI[code]) {
      out += `\\${(WINANSI[code] ?? code).toString(8).padStart(3, '0')}`;
    }
    /* Outside Latin-1 there is no byte to write. The callers draw what matters
       — a star — as a path, so the rest is a character nobody typed into a
       criterion, and a space beats a reader's error dialog. */
    else out += ' ';
  }
  return out;
}

const n = (v: number): string => (Math.round(v * 100) / 100).toString();

/**
 * One page being drawn on, top-down.
 *
 * PDF counts from the bottom left and every line of this would otherwise say
 * `height - y`. The flip happens once, here.
 */
export class Page {
  private ops: string[] = [];

  constructor(private readonly height: number) {}

  private at = (y: number) => this.height - y;

  rect(box: Box, style: { fill?: number; stroke?: number; width?: number } = {}): this {
    const { fill, stroke, width = 0.6 } = style;
    this.ops.push('q');
    if (fill !== undefined) this.ops.push(`${n(fill)} ${n(fill)} ${n(fill)} rg`);
    if (stroke !== undefined) this.ops.push(`${n(stroke)} ${n(stroke)} ${n(stroke)} RG ${n(width)} w`);
    this.ops.push(`${n(box.x)} ${n(this.at(box.y + box.h))} ${n(box.w)} ${n(box.h)} re`);
    this.ops.push(fill !== undefined && stroke !== undefined ? 'B' : fill !== undefined ? 'f' : 'S');
    this.ops.push('Q');
    return this;
  }

  /** The baseline sits at `y`: callers place text, not boxes. */
  text(x: number, y: number, body: string, style: TextStyle = {}): this {
    const { size = 10, bold = false, grey = 0 } = style;
    this.ops.push('q', `${n(grey)} ${n(grey)} ${n(grey)} rg`, 'BT');
    this.ops.push(`/${bold ? 'F2' : 'F1'} ${n(size)} Tf`);
    this.ops.push(`${n(x)} ${n(this.at(y))} Td (${literal(body)}) Tj`);
    this.ops.push('ET', 'Q');
    return this;
  }

  /** A five-pointed star, filled or hollow, inside a square of side `size`. */
  star(x: number, y: number, size: number, filled: boolean): this {
    const r = size / 2;
    const cx = x + r;
    const cy = y + r;
    const points: string[] = [];
    for (let i = 0; i < 10; i++) {
      const reach = i % 2 === 0 ? r : r * 0.42;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      points.push(`${n(cx + reach * Math.cos(angle))} ${n(this.at(cy + reach * Math.sin(angle)))}`);
    }
    const grey = filled ? 0.07 : 0.78;
    this.ops.push('q', `${n(grey)} ${n(grey)} ${n(grey)} rg`);
    this.ops.push(`${points[0]} m`, ...points.slice(1).map((p) => `${p} l`), 'h', 'f', 'Q');
    return this;
  }

  stream(): string {
    return this.ops.join('\n');
  }
}

/**
 * The file itself.
 *
 * Objects in order, an xref table of byte offsets, and a trailer pointing at
 * it. The offsets are what makes a PDF a PDF rather than a text file: they are
 * counted in bytes, and every string here is one byte per character by
 * construction.
 */
export class Pdf {
  readonly pages: Page[] = [];
  readonly width = A4.width;
  readonly height = A4.height;

  page(): Page {
    const made = new Page(this.height);
    this.pages.push(made);
    return made;
  }

  bytes(): Uint8Array {
    const objects: string[] = [];
    const add = (body: string): number => {
      objects.push(body);
      return objects.length;
    };

    // 1 catalog, 2 page tree, then one content stream and one page each.
    const catalog = add('');
    const tree = add('');
    const regular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    const kids: number[] = [];
    for (const page of this.pages) {
      const stream = page.stream();
      const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      kids.push(
        add(
          `<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${n(this.width)} ${n(this.height)}]` +
            ` /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${content} 0 R >>`,
        ),
      );
    }

    objects[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`;
    objects[tree - 1] =
      `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] >>`;

    let file = '%PDF-1.4\n';
    const offsets: number[] = [];
    for (const [i, body] of objects.entries()) {
      offsets.push(file.length);
      file += `${i + 1} 0 obj\n${body}\nendobj\n`;
    }

    const start = file.length;
    file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) file += `${offset.toString().padStart(10, '0')} 00000 n \n`;
    file += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${start}\n%%EOF\n`;

    return Uint8Array.from(file, (c) => c.charCodeAt(0) & 0xff);
  }
}

/**
 * Cuts a sentence into lines that fit, on spaces.
 *
 * A word longer than the column is left to stick out rather than broken: that
 * only happens to a URL or a serial number, and a hyphen inserted into one is
 * worse than a line that runs a little wide.
 */
export function wrap(text: string, width: number, size: number, bold: boolean, measure: Measure): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next, size, bold) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  lines.push(line);
  return lines;
}
