/**
 * Les questions d'un formulaire reliées à la fiche startup.
 *
 * Opened, a linked question is prefilled with what the sheet says today — or,
 * for a KPI, with its value for the period asked. Sent, the answer goes back
 * to the sheet and into its history, under the name of whoever sent it and of
 * the form it came through. The form keeps what was sent that day; the sheet
 * moves on, and the next form reads the new value.
 *
 * Writing back never fails a submission: a value the sheet cannot take is
 * simply not taken.
 */
import {
  currentPeriod,
  prefillFor,
  profileOf,
  sheetWriteFor,
  type FormField,
} from '@ceed/shared';
import * as dir from '../db/directory.js';
import * as attrs from '../db/attributes.js';
import { followSheetChange, kpisOf, putKpiPoint } from './kpis.js';
import { setAttribute } from './orgAttributes.js';

type Linked = Pick<FormField, 'id' | 'type' | 'options' | 'fromProfile' | 'fromPeriod'>;

/** Ce que la fiche dit déjà, pour chaque question reliée. */
export async function prefillFromSheet(orgId: string, fields: readonly Linked[], lang: 'fr' | 'en' = 'fr'): Promise<Record<string, unknown>> {
  const linked = fields.filter((f) => f.fromProfile);
  if (!linked.length) return {};
  const record = await dir.getRecord(orgId);
  if (!record || record.kind !== 'org') return {};
  const profile = profileOf(record);
  const values = linked.some((f) => f.fromProfile!.startsWith('attr:')) ? await attrs.attributeValues(orgId) : {};
  const kpis = linked.some((f) => f.fromProfile!.startsWith('kpi:')) ? await kpisOf(orgId, false) : [];
  const out: Record<string, unknown> = {};
  for (const f of linked) {
    const key = f.fromProfile!;
    let value: unknown;
    if (key.startsWith('kpi:')) {
      const kpi = kpis.find((k) => k.key === key.slice(4));
      const period = f.fromPeriod || (kpi ? currentPeriod(kpi.period) : '');
      value = kpi?.points.find((p) => p.period === period)?.value;
    } else if (key.startsWith('attr:')) {
      value = values[key.slice(5)];
    } else {
      value = prefillFor(f, profile, record.name, lang);
    }
    if (f.type === 'select' && typeof value === 'string' && !f.options.includes(value)) continue;
    if (f.type === 'multiselect' && Array.isArray(value)) value = value.filter((v) => f.options.includes(v));
    if (value !== undefined && value !== null && value !== '') out[f.id] = value;
  }
  return out;
}

/** Les réponses envoyées, recopiées sur la fiche — chacune à l'historique. */
export async function writeBackToSheet(
  orgId: string,
  fields: readonly Linked[],
  answers: Record<string, unknown>,
  by: attrs.Changer,
): Promise<void> {
  const linked = fields.filter((f) => f.fromProfile && answers[f.id] !== undefined);
  if (!linked.length) return;
  const changer = { ...by, source: 'form' as const };
  const patch: Record<string, unknown> = {};
  const documents: { kind: string; uploadId: string }[] = [];

  for (const f of linked) {
    const key = f.fromProfile!;
    const value = answers[f.id];
    try {
      if (key.startsWith('kpi:')) {
        const kpi = (await kpisOf(orgId, false)).find((k) => k.key === key.slice(4));
        if (!kpi || kpi.readOnly) continue;
        await putKpiPoint(orgId, kpi.key, f.fromPeriod || currentPeriod(kpi.period), value, changer, { visibleOnly: false });
      } else if (key.startsWith('attr:')) {
        await setAttribute(orgId, key.slice(5), value, changer, { visibleOnly: false });
      } else {
        const write = sheetWriteFor(key, value);
        if (write && 'patch' in write) Object.assign(patch, write.patch);
        else if (write) documents.push({ kind: write.document, uploadId: write.uploadId });
      }
    } catch {
      /* Une valeur que la fiche ne prend pas reste dans le formulaire, c'est tout. */
    }
  }

  if (!Object.keys(patch).length && !documents.length) return;
  const before = await dir.getRecord(orgId);
  if (!before) return;
  if (Object.keys(patch).length) await dir.updateRecord(orgId, patch);
  for (const d of documents) {
    /* Une pièce déjà sur la fiche est remplacée ; sinon elle s'y ajoute. */
    const same = before.documents.find((x) => x.kind === d.kind && !x.year);
    if (same && same.uploadId === d.uploadId) continue;
    if (same) await dir.changeDocument(orgId, same.id, { uploadId: d.uploadId });
    else await dir.addDocument(orgId, { kind: d.kind, year: null, label: '', uploadId: d.uploadId }, by.name);
  }
  const after = await dir.getRecord(orgId);
  if (!after) return;
  const changes = attrs.sheetDiff(before, after);
  await attrs.recordChanges(orgId, changes, changer);
  await followSheetChange(orgId, changes);
}

