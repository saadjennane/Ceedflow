/**
 * A spreadsheet, written by hand.
 *
 * A .xlsx is a zip of five small XML files. Writing it here rather than
 * reaching for a library keeps a front-end that ships one bundle from growing
 * a dependency for one button — and a CSV, the usual shortcut, opens in Excel
 * as one column or as mojibake depending on which country the machine thinks
 * it is in. This has no such argument with anybody: accents are UTF-8 inside
 * the file, and numbers arrive as numbers rather than as text that looks like
 * numbers until you try to sum it.
 *
 * Entries are stored, not deflated. The format allows it, the files are small,
 * and it means no compressor to get wrong.
 */

export type Cell = string | number | null;

/* ------------------------------------------------------------------ */
/* Zip                                                                 */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface Entry {
  name: string;
  bytes: Uint8Array;
  crc: number;
  offset: number;
}

/** A zip with one stored entry per file, in the order given. */
function zip(files: { name: string; text: string }[]): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const entries: Entry[] = [];
  let offset = 0;

  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };

  for (const file of files) {
    const name = encoder.encode(file.name);
    const bytes = encoder.encode(file.text);
    const crc = crc32(bytes);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); // local file header
    head.setUint16(4, 20, true); // version needed
    head.setUint16(6, 0x0800, true); // names are UTF-8
    head.setUint16(8, 0, true); // stored
    head.setUint32(14, crc, true);
    head.setUint32(18, bytes.length, true);
    head.setUint32(22, bytes.length, true);
    head.setUint16(26, name.length, true);
    entries.push({ name: file.name, bytes, crc, offset });
    push(new Uint8Array(head.buffer));
    push(name);
    push(bytes);
  }

  const start = offset;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const head = new DataView(new ArrayBuffer(46));
    head.setUint32(0, 0x02014b50, true); // central directory header
    head.setUint16(4, 20, true);
    head.setUint16(6, 20, true);
    head.setUint16(8, 0x0800, true);
    head.setUint16(10, 0, true);
    head.setUint32(16, entry.crc, true);
    head.setUint32(20, entry.bytes.length, true);
    head.setUint32(24, entry.bytes.length, true);
    head.setUint16(28, name.length, true);
    head.setUint32(42, entry.offset, true);
    push(new Uint8Array(head.buffer));
    push(name);
  }

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of central directory
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, offset - start, true);
  end.setUint32(16, start, true);
  push(new Uint8Array(end.buffer));

  return new Blob(chunks as BlobPart[], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/* ------------------------------------------------------------------ */
/* Sheet                                                               */
/* ------------------------------------------------------------------ */

const escape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    /* Characters XML cannot carry at all. A comment pasted out of a PDF brings
       them along often enough, and one of them makes the whole file unopenable
       rather than that one cell wrong. */
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/** A1, B1 … Z1, AA1 — the column letters a spreadsheet counts in. */
function ref(column: number, row: number): string {
  let name = '';
  for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return `${name}${row + 1}`;
}

/**
 * One sheet from a grid of cells, the first row being the headers.
 *
 * Strings are written inline rather than through a shared-strings table: it
 * costs a few bytes on repeated words and removes a second file that has to
 * agree with this one.
 */
export function toXlsx(sheetName: string, rows: Cell[][]): Blob {
  const body = rows
    .map((cells, r) => {
      const written = cells
        .map((cell, c) => {
          if (cell === null || cell === '') return '';
          if (typeof cell === 'number' && Number.isFinite(cell)) {
            return `<c r="${ref(c, r)}"><v>${cell}</v></c>`;
          }
          return `<c r="${ref(c, r)}" t="inlineStr"><is><t xml:space="preserve">${escape(String(cell))}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${written}</row>`;
    })
    .join('');

  const widest = rows.reduce((n, row) => Math.max(n, row.length), 0);
  const columns = Array.from({ length: widest }, (_, i) => `<col min="${i + 1}" max="${i + 1}" width="18" customWidth="1"/>`).join('');

  // A sheet name may not carry : \ / ? * [ ] and stops at 31 characters.
  const safeName = sheetName.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Sheet1';

  return zip([
    {
      name: '[Content_Types].xml',
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `</Types>`,
    },
    {
      name: '_rels/.rels',
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
        `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="${escape(safeName)}" sheetId="1" r:id="rId1"/></sheets>` +
        `</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `</Relationships>`,
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        /* The schema fixes the order of these: sheetViews, then cols, then the
           data. Excel refuses the file outright if they come any other way. */
        `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
        // Frozen headers, because the first thing anybody does with this file
        // is scroll past the first screenful of rows.
        `<cols>${columns}</cols>` +
        `<sheetData>${body}</sheetData>` +
        `</worksheet>`,
    },
  ]);
}

/** Hands the file to the browser under a name somebody can find again. */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
