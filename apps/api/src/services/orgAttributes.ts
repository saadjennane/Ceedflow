/**
 * Écrire un attribut ajouté sur une fiche — par CEED, ou par la startup.
 *
 * One path for both, so the rules cannot drift apart: the value is checked
 * against its type, a file has to be the writer's own or the organisation's
 * already, and the change goes into the sheet's history.
 */
import { normaliseAttributeValue, type SheetAttributes } from '@ceed/shared';
import * as attrs from '../db/attributes.js';
import * as repo from '../db/repo.js';
import { HttpError } from '../routes/util.js';

/** What a sheet shows of its added attributes: all of them to CEED, the visible ones to the startup. */
export async function sheetAttributes(orgId: string, visibleOnly: boolean): Promise<SheetAttributes> {
  const attributes = await attrs.listAttributes({ visibleOnly });
  const all = await attrs.attributeValues(orgId);
  const values = Object.fromEntries(Object.entries(all).filter(([id]) => attributes.some((a) => a.id === id)));
  return { attributes, values };
}

export async function setAttribute(
  orgId: string,
  attributeId: string,
  raw: unknown,
  by: attrs.Changer,
  opts: { visibleOnly: boolean; placedBy?: string },
): Promise<SheetAttributes> {
  const attr = await attrs.getAttribute(attributeId);
  if (!attr || attr.archived || (opts.visibleOnly && !attr.visible)) throw new HttpError(404, 'No such attribute.');
  const checked = normaliseAttributeValue(attr, raw);
  if ('error' in checked) throw new HttpError(422, checked.error, { value: checked.error });
  /* Un fichier : le sien, ou déjà celui de l'organisation — connaître
     l'identifiant du fichier d'une autre startup ne suffit pas à le faire sien. */
  const file = checked.value as { uploadId?: string } | null;
  if (attr.type === 'file' && file?.uploadId && opts.placedBy) {
    if (!(await repo.mayPlaceUpload(file.uploadId, opts.placedBy, orgId))) {
      throw new HttpError(422, 'That file did not arrive. Send it again.', { value: 'Missing file.' });
    }
  }
  const before = (await attrs.attributeValues(orgId))[attributeId] ?? null;
  if (JSON.stringify(before) !== JSON.stringify(checked.value ?? null)) {
    await attrs.putAttributeValue(orgId, attributeId, checked.value);
    await attrs.recordChanges(orgId, [attrs.attributeChange(attr, before, checked.value)], by);
  }
  return sheetAttributes(orgId, opts.visibleOnly);
}
