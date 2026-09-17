import type { DirectoryRecord } from '@ceed/shared';
import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Overlays';
import { initials } from './DirectoryPage';
import { RecordModal } from './RecordModal';

/**
 * Picks people out of the directory. A jury and an evaluation panel are both
 * lists of people, so they share this rather than each keeping its own names —
 * which is what let a rename orphan a score.
 *
 * Anyone can be picked: a real jury often includes a partner nobody thought to
 * tag. Those already carrying Jury or Mentor are offered first, and picking
 * somebody gives them the Jury role on the server, so the role fills itself in.
 */
export function PeoplePicker({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  /** Record ids. */
  value: string[];
  onChange: (ids: string[]) => void;
  help?: string;
}) {
  const people = useAsync(() => api.get<DirectoryRecord[]>('/api/records?kind=person'), 'people');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  const all = people.data ?? [];
  const chosen = value.map((id) => all.find((p) => p.id === id)).filter((p): p is DirectoryRecord => Boolean(p));

  const suggestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const scored = all
      .filter((p) => !value.includes(p.id))
      .filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.email.toLowerCase().includes(needle));
    // Those already known as jury or mentors sit at the top, without excluding anyone.
    return scored
      .sort((a, b) => {
        const rank = (p: DirectoryRecord) =>
          p.roles.includes('Jury') ? 0 : p.roles.includes('Mentor') ? 1 : 2;
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      })
      .slice(0, 8);
  }, [all, value, query]);

  const add = (id: string) => {
    onChange([...value, id]);
    setQuery('');
  };

  return (
    <div className="field">
      <label>{label}</label>

      {chosen.length > 0 && (
        <div className="row wrap" style={{ gap: 6, marginBottom: 7 }}>
          {chosen.map((p) => (
            <span className="juror" key={p.id}>
              <span className="jmark">{initials(p.name)}</span>
              {p.name}
              <button
                className="chip-x"
                aria-label={`Remove ${p.name}`}
                onClick={() => onChange(value.filter((id) => id !== p.id))}
              >
                <Icon name="x" size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="search">
        <Icon name="search" size={14} />
        <input
          value={query}
          placeholder={people.data ? 'Search the directory…' : 'Loading…'}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>

      {open && (
        <div className="rows" style={{ marginTop: 6 }}>
          {suggestions.map((p) => (
            <button className="rowcard link-row" key={p.id} onClick={() => add(p.id)}>
              <span className="rec-mark">{initials(p.name)}</span>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                  {p.roles.join(', ') || p.email || '—'}
                </span>
              </span>
            </button>
          ))}

          <button className="rowcard link-row" onClick={() => setCreating(true)}>
            <span className="rec-mark">
              <Icon name="plus" size={12} />
            </span>
            <span style={{ flex: 1, textAlign: 'left', fontSize: 13 }}>
              {query.trim() ? (
                <>
                  Add <strong>{query.trim()}</strong> to the directory
                </>
              ) : (
                'Somebody not in the directory yet'
              )}
            </span>
          </button>
        </div>
      )}

      {help && <div className="hint">{help}</div>}

      {creating && (
        <RecordModal
          kind="person"
          initialName={query.trim()}
          onClose={() => setCreating(false)}
          onSaved={(created) => {
            setCreating(false);
            people.reload();
            add(created.id);
            toast(`${created.name} added to the directory.`);
          }}
        />
      )}
    </div>
  );
}
