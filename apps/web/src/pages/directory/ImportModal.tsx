import { IMPORT_COLUMNS, type ImportReport, type RecordKind } from '@ceed/shared';
import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { Icon } from '../../ui/Icon';
import { Modal, useToast } from '../../ui/Overlays';

/**
 * The first of the three ways in: a file. A CSV is read as it comes; a selection
 * copied straight out of Excel arrives tab-separated, which is faster than
 * saving the sheet out and covers the same need.
 */
export function ImportModal({
  kind,
  onClose,
  onDone,
}: {
  kind: RecordKind;
  onClose: () => void;
  onDone: () => void;
}) {
  const [raw, setRaw] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const table = useMemo(() => parseTable(raw), [raw]);
  const isOrg = kind === 'org';

  /** Columns whose header already reads like one of ours are mapped for you. */
  const guess = (header: string) => {
    const key = header.toLowerCase().replace(/[^a-z]/g, '');
    const hit = IMPORT_COLUMNS.find(
      (c) => c.key.toLowerCase() === key || c.label.toLowerCase().replace(/[^a-z]/g, '') === key,
    );
    if (hit) return hit.key;
    if (/name|nom|organisation|company|societe/.test(key) && !/contact/.test(key)) return 'name';
    if (/mail/.test(key)) return /contact/.test(key) ? 'contactEmail' : 'email';
    if (/tel|phone/.test(key)) return 'phone';
    if (/ville|city/.test(key)) return 'city';
    if (/site|web|url/.test(key)) return 'website';
    if (/secteur|sector|tag/.test(key)) return 'tags';
    if (/contact|fondateur|founder/.test(key)) return 'contactName';
    return '';
  };

  const columnFor = (header: string, index: number) => mapping[String(index)] ?? guess(header);
  const mapped = table
    ? table.rows.map((row) =>
        Object.fromEntries(
          table.headers
            .map((h, i) => [columnFor(h, i), row[i] ?? ''] as const)
            .filter(([key]) => key)
            .map(([key, value]) => [key, value]),
        ),
      )
    : [];

  const hasName = table ? table.headers.some((h, i) => columnFor(h, i) === 'name') : false;

  const run = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const result = await api.post<ImportReport>('/api/records/import', { kind, rows: mapped, dryRun });
      setReport(result);
      if (!dryRun) {
        toast(`${result.created} added, ${result.merged} completed.`);
        onDone();
      }
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const readFile = async (file: File) => {
    setReport(null);
    setMapping({});
    setRaw(await file.text());
  };

  return (
    <Modal
      title={`Import ${isOrg ? 'organisations' : 'people'}`}
      subtitle="Nothing is overwritten: a record already in the directory is completed, never replaced."
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
          <div className="spacer" />
          <button className="btn" disabled={busy || !mapped.length || !hasName} onClick={() => run(true)}>
            Preview
          </button>
          <button
            className="btn primary"
            disabled={busy || !report || !mapped.length || !hasName}
            onClick={() => run(false)}
            title={report ? undefined : 'Preview first'}
          >
            Import {report ? `${report.created + report.merged}` : ''}
          </button>
        </>
      }
    >
      <div className="field">
        <label>The file</label>
        <label className="dropzone">
          <input
            type="file"
            accept=".csv,.tsv,text/csv,text/plain"
            onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
          />
          <Icon name="arrowRight" size={16} />
          <span>
            Choose a <strong>.csv</strong> file
          </span>
        </label>
        <div className="hint">
          Working in Excel? Select the cells, copy, and paste them below — that arrives tab-separated and imports the
          same way. Saving the sheet as .csv works too.
        </div>
      </div>

      <div className="field">
        <label>…or paste the rows</label>
        <textarea
          className="textarea num"
          rows={4}
          placeholder={`Name\tEmail\tCity\nNakhla Bio\tzineb@nakhlabio.ma\tAgadir`}
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setReport(null);
          }}
        />
      </div>

      {table && (
        <>
          <div className="row wrap">
            <span className="eyebrow">Columns</span>
            <span className="badge num">{table.rows.length} rows</span>
            {!hasName && <span className="badge stop">Map one column to Name</span>}
          </div>
          <div className="rows">
            {table.headers.map((header, i) => (
              <div className="rowcard map-row" key={`${header}-${i}`}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{header || <span className="faint">(no header)</span>}</div>
                  <div className="faint" style={{ fontSize: 12 }}>
                    {table.rows[0]?.[i] || '—'}
                  </div>
                </div>
                <Icon name="arrowRight" size={13} />
                <select
                  className="status-select"
                  value={columnFor(header, i)}
                  onChange={(e) => {
                    setMapping((m) => ({ ...m, [String(i)]: e.target.value }));
                    setReport(null);
                  }}
                >
                  <option value="">Ignore this column</option>
                  {IMPORT_COLUMNS.filter((c) => isOrg || !c.key.startsWith('contact')).map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {isOrg && (
            <p className="faint" style={{ margin: 0, fontSize: 12 }}>
              Map <strong>Contact name</strong> and the organisation arrives with the person who holds it, created and
              linked in the same pass.
            </p>
          )}
        </>
      )}

      {report && (
        <>
          <div className="row wrap" style={{ marginTop: 6 }}>
            <span className="badge ok num">{report.created} new</span>
            <span className="badge info num">{report.merged} completed</span>
            <span className="badge num">{report.skipped} skipped</span>
            {report.contacts > 0 && <span className="badge num">{report.contacts} contacts</span>}
          </div>
          <div className="table-wrap">
            <div style={{ maxHeight: 220, overflow: 'auto' }}>
              <table className="data">
                <tbody>
                  {report.outcomes.map((o) => (
                    <tr key={o.row}>
                      <td className="num faint" style={{ width: 40 }}>
                        {o.row}
                      </td>
                      <td className="name">{o.name || <span className="faint">—</span>}</td>
                      <td style={{ width: 110 }}>
                        <span
                          className={
                            o.action === 'created' ? 'badge ok' : o.action === 'merged' ? 'badge info' : 'badge'
                          }
                        >
                          {o.action}
                        </span>
                      </td>
                      <td className="faint" style={{ fontSize: 12 }}>
                        {o.reason}
                        {o.contact ? ` Contact: ${o.contact}.` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Reads a delimited table. Tabs win when present — that is what a paste out of
 * Excel looks like — otherwise commas, with quoted fields honoured.
 */
function parseTable(raw: string): { headers: string[]; rows: string[][] } | null {
  const text = raw.replace(/\r\n?/g, '\n').trim();
  if (!text) return null;
  const delimiter = text.slice(0, text.indexOf('\n') + 1 || undefined).includes('\t') ? '\t' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else quoted = false;
      } else value += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(value.trim());
      value = '';
    } else if (c === '\n') {
      row.push(value.trim());
      rows.push(row);
      row = [];
      value = '';
    } else value += c;
  }
  row.push(value.trim());
  rows.push(row);

  const [headers, ...body] = rows;
  if (!headers?.length) return null;
  return { headers, rows: body.filter((r) => r.some(Boolean)) };
}
