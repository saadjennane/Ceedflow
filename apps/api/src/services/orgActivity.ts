/**
 * Ce qui s'est passé avec une organisation, en un seul fil — et les notes de
 * l'équipe CEED, qui n'existent que là.
 *
 * Read off what already exists: each candidacy's journey, the sheet's history,
 * the letters, the tasks. The notes are the one thing written here, and they
 * stay CEED's: no member route ever reads them.
 */
import { attributeText, newId } from '@ceed/shared';
import { all, one } from '../db/client.js';
import * as dir from '../db/directory.js';
import * as repo from '../db/repo.js';
import { historyOf } from '../db/attributes.js';
import { HttpError } from '../routes/util.js';
import { journeyOf } from './journey.js';
import { lettersAbout } from './mail.js';
import { listTasks } from './tasks.js';

export interface OrgNote {
  id: string;
  body: string;
  byId: string | null;
  byName: string;
  createdAt: string;
  editedAt: string | null;
}

export interface ActivityItem {
  id: string;
  at: string;
  kind: 'note' | 'programme' | 'sheet' | 'mail' | 'task';
  label: string;
  detail: string;
  by: string;
  /** Une note : qui peut la corriger. */
  noteId?: string;
  byId?: string | null;
}

const NOTE_COLS = `id, body, by_id as "byId", by_name as "byName", created_at::text as "createdAt", edited_at::text as "editedAt"`;

export const notesOf = (orgId: string) =>
  all<OrgNote>(`select ${NOTE_COLS} from org_notes where org_id = $1 order by created_at desc`, [orgId]);

export async function addNote(orgId: string, body: string, by: { id: string; name: string }): Promise<OrgNote> {
  const id = newId('note');
  await all(`insert into org_notes (id, org_id, body, by_id, by_name) values ($1,$2,$3,$4,$5)`, [id, orgId, body.trim(), by.id, by.name]);
  return (await one<OrgNote>(`select ${NOTE_COLS} from org_notes where id = $1`, [id]))!;
}

/** Corriger ou retirer sa note : seulement la sienne. */
export async function changeNote(id: string, by: string, body: string | null): Promise<void> {
  const note = await one<{ byId: string | null }>('select by_id as "byId" from org_notes where id = $1', [id]);
  if (!note) throw new HttpError(404, 'Note not found.');
  if (note.byId !== by) throw new HttpError(403, 'Only who wrote a note can change it.');
  if (body === null) await all('delete from org_notes where id = $1', [id]);
  else await all('update org_notes set body = $2, edited_at = now() where id = $1', [id, body.trim()]);
}

const said = (v: unknown, type = ''): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object' && !Array.isArray(v)) {
    const f = v as Record<string, unknown>;
    if (typeof f.filename === 'string') return f.filename;
    return Object.values(f).filter((x) => typeof x === 'string' || typeof x === 'number').join(', ') || '—';
  }
  return attributeText(type, v);
};

export async function orgActivity(orgId: string): Promise<ActivityItem[]> {
  const record = await dir.getRecord(orgId);
  if (!record || record.kind !== 'org') throw new HttpError(404, 'Organisation not found.');
  const out: ActivityItem[] = [];

  for (const n of await notesOf(orgId)) {
    out.push({ id: `note:${n.id}`, at: n.createdAt, kind: 'note', label: n.body, detail: n.editedAt ? 'edited' : '', by: n.byName, noteId: n.id, byId: n.byId });
  }

  const candidacies = await repo.candidatesOfOrg(orgId);
  for (const { id } of candidacies) {
    const c = await repo.getCandidate(id);
    if (!c) continue;
    const j = await journeyOf(c);
    if (!j) continue;
    for (const [i, e] of j.history.entries()) {
      out.push({ id: `prog:${c.id}:${i}`, at: e.at, kind: 'programme', label: e.label, detail: `${j.programName} — ${j.editionName}${e.phase ? ` · ${e.phase}` : ''}`, by: '' });
    }
  }

  for (const h of await historyOf(orgId, 300)) {
    out.push({
      id: `sheet:${h.id}`, at: h.at, kind: 'sheet', label: h.label,
      detail: `${said(h.before)} → ${said(h.after)}${h.source === 'form' && h.sourceLabel ? ` · via ${h.sourceLabel}` : ''}`,
      by: h.byName,
    });
  }

  for (const l of await lettersAbout(orgId, record.emails, candidacies.map((c) => c.id), 200)) {
    out.push({ id: `mail:${l.id}`, at: l.createdAt, kind: 'mail', label: l.subject, detail: `To ${l.toName || l.to} · ${l.state}`, by: '' });
  }

  for (const t of await listTasks({ ownerIds: [orgId] })) {
    out.push({ id: `task:${t.id}`, at: t.createdAt, kind: 'task', label: `Task given — ${t.title}`, detail: t.dueOn ? `Due ${t.dueOn}` : '', by: '' });
    if (t.doneAt) out.push({ id: `task-done:${t.id}`, at: t.doneAt, kind: 'task', label: `Task done — ${t.title}`, detail: '', by: '' });
  }

  return out.sort((a, b) => b.at.localeCompare(a.at));
}
