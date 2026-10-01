import { type Block, type Candidate, type FormField } from '@ceed/shared';
import { useState } from 'react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { download, toWorkbook, type Cell } from '../../lib/xlsx';

interface ReturnView {
  itemId: string;
  value: unknown;
  returnedAt: string | null;
}

interface Row {
  candidate: Candidate;
  returns: ReturnView[];
  done: number;
  required: number;
  complete: boolean;
}

interface View {
  blockId: string;
  name: string;
  intro: string;
  items: FormField[];
  rows: Row[];
}

const given = (value: unknown) =>
  !(value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length));

/** What a value looks like in a cell: a file opens, anything else is read. */
function Given({ value }: { value: unknown }) {
  if (!given(value)) return <span className="faint">—</span>;
  if (typeof value === 'object' && value !== null && 'uploadId' in value) {
    const file = value as { uploadId: string; filename: string };
    return (
      <a href={`/api/uploads/${file.uploadId}`} target="_blank" rel="noreferrer" title={file.filename}>
        <Icon name="file" size={13} /> {file.filename}
      </a>
    );
  }
  return <>{Array.isArray(value) ? value.join(', ') : String(value)}</>;
}

/**
 * Who has sent what.
 *
 * The same matrix, read along either axis: by startup to ask whether a file is
 * complete, by item to ask who still owes the RIB. Those are the two questions
 * the work actually poses, a day apart, and turning the table is cheaper than
 * keeping two screens that can disagree.
 */
export function DeliverableTab({ block }: { block: Block }) {
  const view = useAsync(() => api.get<View>(`/api/blocks/${block.id}/deliverables`), block.id);
  const [by, setBy] = useState<'startup' | 'item'>('startup');

  if (view.error) return <div className="empty">{view.error}</div>;
  if (!view.data) return <div className="empty" style={{ padding: 40 }} />;
  const { items, rows } = view.data;

  if (!items.length) {
    return (
      <div className="empty">
        <h3>Nothing is being asked yet</h3>
        <p>Open this block's setup and list what a file needs — the documents and the figures both.</p>
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="empty">
        <h3>Nobody has reached this step</h3>
        <p>Startups arrive here once they pass the selection before it.</p>
      </div>
    );
  }

  const valueOf = (row: Row, itemId: string) => row.returns.find((r) => r.itemId === itemId);
  const sentFor = (itemId: string) => rows.filter((row) => given(valueOf(row, itemId)?.value)).length;
  const complete = rows.filter((r) => r.complete).length;

  const exportMatrix = () => {
    const head: Cell[] = ['Startup', 'Contact', 'Dossier'];
    for (const item of items) head.push(item.required ? `${item.label} *` : item.label);
    const sheet: Cell[][] = [head];
    for (const row of rows) {
      const line: Cell[] = [
        row.candidate.orgName,
        row.candidate.contactName || '',
        `${row.done}/${row.required}`,
      ];
      for (const item of items) {
        const got = valueOf(row, item.id)?.value;
        if (!given(got)) line.push('');
        else if (typeof got === 'object' && got !== null && 'filename' in got) {
          line.push(String((got as { filename: string }).filename));
        } else line.push(Array.isArray(got) ? got.join(', ') : (got as string | number));
      }
      sheet.push(line);
    }
    download(
      toWorkbook([{ name: block.name.slice(0, 31) || 'Deliverables', rows: sheet }]),
      `${block.name} — ${new Date().toISOString().slice(0, 10)}.xlsx`.replace(/[/\\:*?"<>|]/g, '-'),
    );
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row wrap">
        <span className="badge num">{rows.length} startups</span>
        <span className={complete === rows.length ? 'badge ok' : 'badge'}>
          <span className="num">{complete}</span> complete
        </span>
        {/* The axis, not a filter: the same rows either way. */}
        <div className="seg" role="group" aria-label="Read by">
          <button className={by === 'startup' ? 'on' : ''} onClick={() => setBy('startup')}>
            By startup
          </button>
          <button className={by === 'item' ? 'on' : ''} onClick={() => setBy('item')}>
            By item
          </button>
        </div>
        <div className="spacer" />
        <button className="btn sm" onClick={exportMatrix}>
          <Icon name="file" size={13} /> Export
        </button>
      </div>

      {view.data.intro && (
        <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
          They are told: “{view.data.intro}”
        </p>
      )}

      {by === 'startup' ? (
        <div className="table-wrap tall">
          <table className="data score-table">
            <thead>
              <tr>
                <th>Startup</th>
                <th>File</th>
                {items.map((item) => (
                  <th key={item.id} title={item.help || undefined}>
                    {item.label || 'Untitled'}
                    {item.required && <span style={{ color: 'var(--stop)' }}> *</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.candidate.id}>
                  <td className="name">{row.candidate.orgName}</td>
                  <td>
                    <span className={row.complete ? 'badge ok num' : 'badge num'}>
                      {row.done}/{row.required}
                    </span>
                  </td>
                  {items.map((item) => {
                    const got = valueOf(row, item.id);
                    return (
                      <td key={item.id} className="muted" title={got?.returnedAt ? formatDate(got.returnedAt.slice(0, 10)) : undefined}>
                        <Given value={got?.value} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* The other axis: one block per thing asked for, and who is missing it
           listed by name — which is what chasing a single document needs. */
        <div className="stack" style={{ gap: 10 }}>
          {items.map((item) => {
            const sent = sentFor(item.id);
            const missing = rows.filter((row) => !given(valueOf(row, item.id)?.value));
            return (
              <section className="card" key={item.id}>
                <div className="rowcard-head" style={{ padding: '12px 16px' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 15, margin: 0 }}>
                      {item.label || 'Untitled'}
                      {item.required && <span style={{ color: 'var(--stop)' }}> *</span>}
                    </h3>
                    {item.help && (
                      <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
                        {item.help}
                      </p>
                    )}
                  </div>
                  <span className={sent === rows.length ? 'badge ok num' : 'badge num'}>
                    {sent}/{rows.length}
                  </span>
                </div>
                <div className="rows" style={{ padding: 12 }}>
                  {rows.map((row) => {
                    const got = valueOf(row, item.id);
                    return (
                      <div className="rowcard" key={row.candidate.id} style={{ padding: '8px 11px', gap: 12 }}>
                        {/* The ones still missing read heavier: this list is
                            for chasing, and the names to chase are the point. */}
                        <span style={{ flex: 1, fontSize: 13, fontWeight: given(got?.value) ? 400 : 600 }}>
                          {row.candidate.orgName}
                        </span>
                        <span className="faint" style={{ fontSize: 12, flexShrink: 0 }}>
                          {got?.returnedAt ? formatDate(got.returnedAt.slice(0, 10)) : ''}
                        </span>
                        <span style={{ fontSize: 13, textAlign: 'right', minWidth: 90 }}>
                          <Given value={got?.value} />
                        </span>
                      </div>
                    );
                  })}
                  {missing.length === 0 && (
                    <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
                      Everybody has sent this one.
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
