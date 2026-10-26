/**
 * Ce qu'on accepte comme fichier, et comment on le rend.
 *
 * A file is stored with the type it claims and served back from the app's own
 * address — so a page of HTML sent as "text/html" would open as a page, with
 * the session of whoever clicked it. Two locks, either of which is enough on
 * its own: only document, image and media types get in, and what comes out is
 * a download unless it is a picture or a PDF, with the browser told not to
 * guess and not to run anything.
 */

/** Par extension : ce qu'un navigateur envoie quand il ne sait pas dire mieux. */
const BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  svg: 'image/svg+xml',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  key: 'application/vnd.apple.keynote',
  pages: 'application/vnd.apple.pages',
  numbers: 'application/vnd.apple.numbers',
  csv: 'text/csv',
  txt: 'text/plain',
  rtf: 'application/rtf',
  zip: 'application/zip',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
};

const ALLOWED = new Set([...Object.values(BY_EXTENSION), 'application/x-zip-compressed', 'image/jpg']);

/**
 * Le type sous lequel garder ce fichier, ou null s'il n'entre pas.
 * Le type annoncé s'il est des nôtres, sinon celui de l'extension.
 */
export function uploadType(filename: string, claimed: string): string | null {
  const mime = claimed.trim().toLowerCase();
  if (ALLOWED.has(mime)) return mime;
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  return BY_EXTENSION[ext] ?? null;
}

/** What can be shown in the page rather than downloaded — and never runs anything. */
const SHOWN = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']);

/**
 * Les en-têtes d'un fichier rendu.
 *
 * The name goes out twice: once in plain ASCII for old clients, once encoded
 * (RFC 5987) so an accent, an Arabic name or the narrow space of a macOS
 * screenshot reaches the person instead of failing the whole response.
 */
export function servingHeaders(mime: string, filename: string): Record<string, string> {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const shown = SHOWN.has(mime);
  return {
    'content-type': ALLOWED.has(mime) ? mime : 'application/octet-stream',
    'content-disposition': `${shown ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encoded}`,
    'x-content-type-options': 'nosniff',
    /* Une page isolée : même ouverte, elle n'exécute rien et ne parle pas au
       site. Le lecteur de PDF du navigateur n'aime pas l'isolement — un PDF
       en est donc dispensé, et ne fait que s'afficher. */
    ...(mime === 'application/pdf' ? {} : { 'content-security-policy': "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'" }),
  };
}

/** Combien de fichiers une même personne dépose en une heure, au plus. */
export const UPLOADS_PER_HOUR = 120;
