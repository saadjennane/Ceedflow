/** Prefixed, sortable-ish ids. Readable in URLs and in the database. */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomPart(length: number): string {
  let out = '';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${randomPart(6)}`;
}

export const idOf = {
  program: () => newId('prg'),
  edition: () => newId('edt'),
  track: () => newId('trk'),
  phase: () => newId('phs'),
  block: () => newId('blk'),
  field: () => newId('fld'),
  criterion: () => newId('crt'),
  candidate: () => newId('cnd'),
};
