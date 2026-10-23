/**
 * Les besoins et les documents d'une fiche, une règle pour deux portes.
 *
 * Une startup écrit sa fiche depuis son espace, CEED depuis l'annuaire : les
 * deux passent ici, pour qu'une réponse refusée d'un côté ne passe pas de
 * l'autre.
 */
import {
  DOCUMENT_KINDS,
  NEED_KEYS,
  NEED_SCHEMAS,
  documentInput,
  documentPatch,
  needInput,
  type NeedKey,
} from '@ceed/shared';
import * as dir from '../db/directory.js';
import { HttpError, parse } from '../routes/util.js';

/**
 * Un besoin : sélectionné, désélectionné, ou ses réponses.
 *
 * Les réponses envoyées complètent celles qu'il avait, puis le tout est revu
 * contre la forme de ce besoin : une valeur hors liste ne se glisse pas dans
 * ce qu'un rapprochement lira un jour.
 */
export async function saveNeed(orgId: string, need: string, body: unknown): Promise<void> {
  if (!NEED_KEYS.includes(need as NeedKey)) throw new HttpError(404, 'No such need.');
  const input = parse(needInput, body);
  let data: Record<string, unknown> | undefined;
  if (input.data) {
    const current = (await dir.getRecord(orgId))?.needs.find((n) => n.need === need)?.data ?? {};
    data = parse(NEED_SCHEMAS[need as NeedKey], { ...current, ...input.data }) as Record<string, unknown>;
  }
  await dir.putNeed(orgId, need, { active: input.active, data });
}

/** Le fichier existe, et il a la forme que ce type de document attend. */
async function checkFile(kind: string, uploadId: string) {
  const meta = await dir.uploadMeta(uploadId);
  if (!meta) throw new HttpError(422, 'That file did not arrive. Send it again.', { uploadId: 'Missing file.' });
  const allowed = DOCUMENT_KINDS.find((d) => d.key === kind)?.mimes ?? [];
  if (!(allowed as readonly string[]).includes(meta.mime)) {
    const formats = DOCUMENT_KINDS.find((d) => d.key === kind)?.accept ?? '';
    throw new HttpError(422, `This document is expected as ${formats.replace(/\./g, '').replace(/,/g, ', ')}.`, {
      uploadId: 'Wrong format.',
    });
  }
}

export async function addOrgDocument(orgId: string, body: unknown, byName: string): Promise<void> {
  const input = parse(documentInput, body);
  await checkFile(input.kind, input.uploadId);
  await dir.addDocument(orgId, input, byName);
}

export async function changeOrgDocument(orgId: string, id: string, body: unknown): Promise<boolean> {
  const patch = parse(documentPatch, body);
  const found = await dir.changeDocument(orgId, id, {});
  if (!found) return false;
  if (patch.uploadId) await checkFile(found.kind, patch.uploadId);
  await dir.changeDocument(orgId, id, patch);
  return true;
}
