/**
 * Ce que CEED mesure lui-même, saisi moment par moment.
 */
import { type FormField, type ReportingView } from '@ceed/shared';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../ui/Overlays';

export function TeamValues({ editionId, view, onChanged }: { editionId: string; view: ReportingView; onChanged: (next: ReportingView) => void }) {
  if (!view.teamIndicators.length) return null;
  return (
    <section className="card card-pad stack" style={{ gap: 8 }}>
      <div className="eyebrow">Measured by CEED</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ fontSize: 12.5 }}>
          <thead>
            <tr>
              <th>Indicator</th>
              {view.moments.map((m) => (
                <th key={m.id}>{m.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.teamIndicators.map((f) => (
              <tr key={f.id}>
                <td>{f.label || 'Untitled'}</td>
                {view.moments.map((m) => (
                  <td key={m.id}>
                    <Cell
                      field={f}
                      value={view.teamValues.find((v) => v.momentId === m.id && v.indicatorId === f.id)?.value}
                      url={`/api/editions/${editionId}/reporting/team/${m.id}/${f.id}`}
                      onChanged={onChanged}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Une case : enregistrée en la quittant. */
function Cell({ field, value, url, onChanged }: { field: FormField; value: unknown; url: string; onChanged: (next: ReportingView) => void }) {
  const initial = value === undefined || value === null ? '' : String(value);
  const [text, setText] = useState(initial);
  const toast = useToast();
  const save = async (next: string) => {
    if (next === initial) return;
    const n = Number(next.replace(',', '.'));
    const sent = next.trim() === '' ? null : field.type === 'number' && Number.isFinite(n) ? n : next.trim();
    try {
      onChanged(await api.put<ReportingView>(url, { value: sent }));
    } catch (err) {
      toast((err as Error).message, true);
    }
  };
  if (field.type === 'select') {
    return (
      <select className="input" value={text} onChange={(e) => { setText(e.target.value); void save(e.target.value); }}>
        <option value="" />
        {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return (
    <input
      className="input"
      style={{ minWidth: 90 }}
      inputMode={field.type === 'number' ? 'decimal' : undefined}
      type={field.type === 'date' ? 'date' : 'text'}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => void save(text)}
    />
  );
}
