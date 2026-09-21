import type { DirectoryRecord } from '@ceed/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Overlays';
import { SearchBox } from '../../ui/SearchBox';
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

  /* The list used to have no way out: nothing closed it, so it sat over the
     rest of the form long after the person had been picked. It closes on the
     three things that mean "done" — a pick, a click away, Escape — and it is
     capped in height, because a list that filled the panel left nowhere to
     click away *to*. */
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    // Capture, so nothing between here and the document can swallow it.
    document.addEventListener('mousedown', away, true);
    document.addEventListener('focusin', away, true);
    return () => {
      document.removeEventListener('mousedown', away, true);
      document.removeEventListener('focusin', away, true);
    };
  }, [open]);

  const add = (id: string) => {
    onChange([...value, id]);
    setQuery('');
    // Typing the next name reopens it, so adding a whole jury stays one flow.
    setOpen(false);
  };

  return (
    <div
      className="field"
      ref={box}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) setOpen(false);
      }}
    >
      <label>{label}</label>

      {chosen.length > 0 && (
        <div className="row wrap" style={{ gap: 6, marginBottom: 7 }}>
          {chosen.map((p) => (
            <span className="juror" key={p.id}>
              <span className="juror-mark">{initials(p.name)}</span>
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

      <SearchBox
        value={query}
        placeholder={people.data ? 'Search the directory…' : 'Loading…'}
        onChange={(v) => {
          setQuery(v);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />

      {open && (
        <div className="rows picker-rows">
          {/* A way out that is always in reach, whatever is below. */}
          <button type="button" className="picker-done" onClick={() => setOpen(false)}>
            {suggestions.length ? `${suggestions.length} to pick from` : 'Nobody matches'}
            <span className="linkish">Done</span>
          </button>
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
