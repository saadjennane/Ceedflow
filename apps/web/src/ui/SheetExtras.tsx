/**
 * Sur la page d'une startup, côté CEED : ses attributs ajoutés, et le journal
 * de sa fiche — ce qui a changé, avant et après, qui, d'où.
 */
import { attributeText, type SheetAttributes, type SheetChange } from '@ceed/shared';
import { useState } from 'react';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';

/** Les attributs ajoutés qui ont une valeur, en lecture. */
export function AddedFacts({ recordId, version }: { recordId: string; version: number }) {
  const data = useAsync(() => api.get<SheetAttributes>(`/api/records/${recordId}/attributes`), `attrs:${recordId}:${version}`);
  const filled = (data.data?.attributes ?? []).filter((a) => data.data!.values[a.id] !== undefined);
  if (!filled.length) return null;
  return (
    <div className="card card-pad stack" style={{ gap: 10 }}>
      <strong style={{ fontFamily: 'var(--display)', fontSize: 13.5 }}>Added attributes</strong>
    <dl className="answers" style={{ margin: 0 }}>
      {filled.map((a) => {
        const value = data.data!.values[a.id];
        return (
          <div key={a.id} style={{ display: 'contents' }}>
            <dt>
              {a.label}
              {!a.visible && <span className="badge" style={{ marginLeft: 6 }}>CEED only</span>}
            </dt>
            <dd>
              {a.type === 'file' && value ? (
                <a href={`/api/uploads/${(value as { uploadId: string }).uploadId}`} target="_blank" rel="noreferrer">
                  {attributeText(a.type, value)}
                </a>
              ) : (
                attributeText(a.type, value, a.currency)
              )}
            </dd>
          </div>
        );
      })}
    </dl>
    </div>
  );
}

/** Une valeur du journal, en mots. */
const said = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object' && v && 'filename' in v) return String((v as { filename: string }).filename || 'File');
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === 'object' && x ? Object.values(x).filter((y) => typeof y === 'string').join(', ') : String(x))).join(' · ') || '—';
  }
  if (typeof v === 'object') {
    const words = Object.entries(v as Record<string, unknown>)
      .filter(([k, x]) => !/id$/i.test(k) && x !== null && x !== '' && typeof x !== 'object')
      .map(([, x]) => String(x));
    return words.join(', ') || '—';
  }
  return String(v);
};

/** Le journal de la fiche, du plus récent au plus ancien. */
export function SheetHistory({ recordId, version }: { recordId: string; version: number }) {
  const history = useAsync(() => api.get<SheetChange[]>(`/api/records/${recordId}/history`), `history:${recordId}:${version}`);
  const [all, setAll] = useState(false);
  const rows = history.data ?? [];
  const shown = all ? rows : rows.slice(0, 8);
  return (
    <div className="card card-pad stack" style={{ gap: 8 }}>
      <div className="eyebrow">Sheet history</div>
      {history.data && !rows.length && (
        <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>Nothing changed on the sheet since its history is kept.</p>
      )}
      {shown.map((c) => (
        <div key={c.id} className="stack" style={{ gap: 1, fontSize: 12.5 }}>
          <span>
            <strong>{c.label}</strong>
            <span className="faint"> · {formatDate(c.at)}</span>
          </span>
          <span style={{ overflowWrap: 'anywhere' }}>
            <span className="faint" style={{ textDecoration: 'line-through' }}>{said(c.before)}</span> → {said(c.after)}
          </span>
          <span className="faint" style={{ fontSize: 11.5 }}>
            {c.byName || (c.byKind === 'system' ? 'CeedFlow' : 'Someone')}
            {c.byKind === 'member' ? ' (startup)' : c.byKind === 'staff' ? ' (CEED)' : ''}
            {c.source === 'form' && c.sourceLabel ? ` · via ${c.sourceLabel}` : ''}
          </span>
        </div>
      ))}
      {rows.length > 8 && (
        <button className="linkish" style={{ alignSelf: 'flex-start', fontSize: 12.5 }} onClick={() => setAll((x) => !x)}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}
