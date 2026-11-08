/**
 * Ce à quoi une tâche se rapporte : une personne, une organisation, un
 * programme ou une startup dans un programme. Une pastille qui dit le lien ;
 * un clic pour le changer. La même sur une tâche proposée et sur une tâche.
 */
import { type DirectoryRecord, type ProgramWithEditions } from '@ceed/shared';
import { useState } from 'react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Icon } from './Icon';
import '../pages/meetings/meetings.css';

type Kind = '' | 'person' | 'org' | 'edition' | 'candidate';
export type TaskLink = { kind: Exclude<Kind, ''>; id: string; name: string } | null;
const KINDS: { value: Kind; label: string }[] = [
  { value: '', label: 'Nothing' },
  { value: 'person', label: 'An individual' },
  { value: 'org', label: 'An organisation' },
  { value: 'edition', label: 'A programme' },
  { value: 'candidate', label: 'A startup in a programme' },
];

export function LinkPicker({
  value,
  unresolved = '',
  editions: given,
  editable,
  onLink,
}: {
  value: TaskLink;
  /** Le sujet tel qu'écrit, quand il n'a pas été trouvé. */
  unresolved?: string;
  editions?: { id: string; name: string }[];
  editable: boolean;
  onLink: (link: { kind: Exclude<Kind, ''>; id: string } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>(value?.kind ?? '');
  const [edition, setEdition] = useState(value?.kind === 'edition' ? value.id : '');
  const programs = useAsync(
    async () => (open && !given ? api.get<ProgramWithEditions[]>('/api/programs') : null),
    `link-programs:${open}`,
  );
  const editions = given ?? (programs.data ?? []).flatMap((p) => p.editions.map((e) => ({ id: e.id, name: `${p.name} — ${e.name}` })));
  const records = useAsync(
    async () => (open && (kind === 'person' || kind === 'org') ? api.get<DirectoryRecord[]>(`/api/records?kind=${kind}`) : null),
    `link-records:${open}:${kind}`,
  );
  const startups = useAsync(
    async () => (open && kind === 'candidate' && edition ? api.get<{ id: string; orgName: string }[]>(`/api/editions/${edition}/candidates`) : null),
    `link-startups:${open}:${edition}`,
  );

  const label = value?.name || (unresolved ? `“${unresolved}” — not found` : 'No link');

  if (!open) {
    return (
      <span className={!value && unresolved && editable ? 'chip warn' : 'chip'} title="Linked to">
        <Icon name="link" size={12} />
        {editable ? (
          <button className="linkish" style={{ fontSize: 12.5, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => setOpen(true)}>
            {label}
          </button>
        ) : (
          <span style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        )}
      </span>
    );
  }

  const pick = (link: { kind: Exclude<Kind, ''>; id: string } | null) => {
    onLink(link);
    setOpen(false);
  };

  return (
    <span className="chip" style={{ height: 'auto', padding: '3px 8px', flexWrap: 'wrap', gap: 6 }}>
      <Icon name="link" size={12} />
      <select value={kind} aria-label="Link to" onChange={(e) => {
        const k = e.target.value as Kind;
        setKind(k);
        setEdition('');
        if (!k) pick(null);
      }}>
        {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
      </select>
      {(kind === 'person' || kind === 'org') && (
        <select aria-label="Which one" defaultValue="" onChange={(e) => e.target.value && pick({ kind, id: e.target.value })}>
          <option value="">{records.loading ? 'Loading…' : kind === 'person' ? 'Pick someone…' : 'Pick an organisation…'}</option>
          {(records.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      )}
      {(kind === 'edition' || kind === 'candidate') && (
        <select aria-label="Which programme" value={edition} onChange={(e) => {
          setEdition(e.target.value);
          if (kind === 'edition' && e.target.value) pick({ kind: 'edition', id: e.target.value });
        }}>
          <option value="">Pick a programme…</option>
          {editions.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      )}
      {kind === 'candidate' && edition && (
        <select aria-label="Which startup" defaultValue="" onChange={(e) => e.target.value && pick({ kind: 'candidate', id: e.target.value })}>
          <option value="">{startups.loading ? 'Loading…' : 'Pick a startup…'}</option>
          {(startups.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.orgName}</option>)}
        </select>
      )}
      <button className="linkish" style={{ fontSize: 12 }} onClick={() => setOpen(false)}>Cancel</button>
    </span>
  );
}
