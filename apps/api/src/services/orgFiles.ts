/**
 * Tous les fichiers d'une organisation au même endroit, et ceux qui l'ont
 * accompagnée.
 *
 * Files live where they were given — the sheet, a deliverable, an application,
 * a KPI, an added attribute. This reads them all back with where each came
 * from, rather than copying them anywhere.
 */
import { uploadIdsIn, type FormField } from '@ceed/shared';
import { all } from '../db/client.js';
import * as dir from '../db/directory.js';
import * as repo from '../db/repo.js';
import { HttpError } from '../routes/util.js';

export interface OrgFile {
  uploadId: string;
  filename: string;
  size: number;
  at: string;
  /** Where it was given: the sheet, a programme's list, an application… */
  origin: string;
  label: string;
}

export async function orgFiles(orgId: string): Promise<OrgFile[]> {
  const record = await dir.getRecord(orgId);
  if (!record || record.kind !== 'org') throw new HttpError(404, 'Organisation not found.');
  const wanted: Omit<OrgFile, 'filename' | 'size'>[] = [];

  for (const d of record.documents) {
    wanted.push({ uploadId: d.uploadId, at: d.createdAt, origin: 'Sheet', label: d.label || d.kind.replace(/_/g, ' ') + (d.year ? ` ${d.year}` : '') });
  }
  const values = await all<{ value: { uploadId?: string }; label: string; at: string }>(
    `select v.value, a.label, v.updated_at::text as at from org_attribute_values v join org_attributes a on a.id = v.attribute_id
      where v.org_id = $1 and v.value ? 'uploadId'`,
    [orgId],
  );
  for (const v of values) if (v.value.uploadId) wanted.push({ uploadId: v.value.uploadId, at: v.at, origin: 'Sheet', label: v.label });
  const points = await all<{ value: { uploadId?: string }; key: string; period: string; at: string }>(
    `select value, key, period, updated_at::text as at from org_kpi_points where org_id = $1 and value ? 'uploadId'`,
    [orgId],
  );
  for (const p of points) if (p.value.uploadId) wanted.push({ uploadId: p.value.uploadId, at: p.at, origin: 'KPI', label: `${p.key} — ${p.period}` });

  for (const { id } of await repo.candidatesOfOrg(orgId)) {
    const c = await repo.getCandidate(id);
    if (!c) continue;
    const detail = await repo.getEditionDetail(c.editionId);
    const where = detail ? `${detail.program.name} — ${detail.name}` : 'Programme';
    for (const uploadId of uploadIdsIn(c.answers)) {
      wanted.push({ uploadId, at: c.submittedAt, origin: `Application · ${where}`, label: 'Attachment' });
    }
    const blocks = detail?.tracks.flatMap((t) => t.phases.flatMap((p) => p.blocks)).filter((b) => b.type === 'deliverable') ?? [];
    for (const block of blocks) {
      const items = (block.config as { items?: FormField[] }).items ?? [];
      for (const r of await repo.listReturnsFor(block.id, c.id)) {
        for (const uploadId of uploadIdsIn(r.value)) {
          wanted.push({ uploadId, at: r.returnedAt ?? '', origin: `${block.name} · ${where}`, label: items.find((i) => i.id === r.itemId)?.label ?? 'Piece' });
        }
      }
    }
  }

  if (!wanted.length) return [];
  const meta = await all<{ id: string; filename: string; size: number }>(
    'select id, filename, size from uploads where id = any($1::text[])',
    [[...new Set(wanted.map((w) => w.uploadId))]],
  );
  const seen = new Set<string>();
  return wanted
    .filter((w) => meta.some((m) => m.id === w.uploadId))
    .filter((w) => (seen.has(w.uploadId + w.origin) ? false : (seen.add(w.uploadId + w.origin), true)))
    .map((w) => {
      const m = meta.find((x) => x.id === w.uploadId)!;
      return { ...w, filename: m.filename, size: m.size };
    })
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
}

/** Ceux qui l'ont accompagnée en One to One : combien de séances tenues, et dans quels programmes. */
export async function orgCompanions(orgId: string): Promise<{ personId: string; name: string; held: number; planned: number; programmes: string[] }[]> {
  return all(
    `with people as (
       select m.id, m.status, pr.name as programme,
              unnest(case when jsonb_array_length(m.with_ids) > 0
                          then array(select jsonb_array_elements_text(m.with_ids))
                          else array[m.person_id] end) as person_id
         from one_to_one_meetings m
         join candidates c on c.id = m.candidate_id
         join editions e on e.id = c.edition_id
         join programs pr on pr.id = e.program_id
        where c.org_id = $1 and m.status <> 'cancelled')
     select p.person_id as "personId", r.name,
            count(*) filter (where p.status = 'held')::int as held,
            count(*) filter (where p.status = 'planned')::int as planned,
            array_agg(distinct p.programme) as programmes
       from people p join records r on r.id = p.person_id
      where p.person_id is not null
      group by p.person_id, r.name
      order by held desc, r.name`,
    [orgId],
  );
}
