/**
 * Les KPI d'une startup : leur évolution, période par période.
 *
 * One card per KPI with its latest value; opened, the curve, the table of its
 * periods, and a way to give the value of a period — any period, not only the
 * current one: a turnover for 2024 can be given in 2026. The same panel on
 * CEED's page of the startup and in the startup's own space; they differ only
 * by where they write and in which language they speak.
 */
import {
  MAX_UPLOAD_BYTES,
  attributeText,
  currentPeriod,
  periodLabel,
  type AttributeFile,
  type KpiPeriod,
  type KpiSeries,
} from '@ceed/shared';
import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Icon } from './Icon';
import { useToast } from './Overlays';

type Lang = 'fr' | 'en';

const WORDS = {
  title: { fr: 'Indicateurs', en: 'KPIs' },
  none: { fr: 'Pas encore de valeur.', en: 'No value yet.' },
  add: { fr: 'Ajouter une valeur', en: 'Add a value' },
  period: { fr: 'Période', en: 'Period' },
  value: { fr: 'Valeur', en: 'Value' },
  save: { fr: 'Enregistrer', en: 'Save' },
  cancel: { fr: 'Annuler', en: 'Cancel' },
  saved: { fr: 'Enregistré.', en: 'Saved.' },
  remove: { fr: 'Effacer', en: 'Remove' },
  followed: { fr: 'Calculé depuis les levées de fonds.', en: 'Added up from the funding rounds.' },
  replaces: { fr: 'Cette période a déjà une valeur : elle sera corrigée.', en: 'This period has a value already: it will be corrected.' },
  file: { fr: 'Choisir un fichier', en: 'Choose a file' },
  tooBig: { fr: 'Fichier trop lourd : 10 Mo au plus.', en: 'File too large: 10 MB at most.' },
} as const;

export function KpiPanel({ url, lang = 'en', editable }: { url: string; lang?: Lang; editable: boolean }) {
  const kpis = useAsync(() => api.get<KpiSeries[]>(url), url);
  const [open, setOpen] = useState<string | null>(null);
  const w = (k: keyof typeof WORDS) => WORDS[k][lang];
  if (!kpis.data?.length) return null;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="eyebrow">{w('title')}</div>
      <div className="rows">
        {kpis.data.map((k) => (
          <KpiCard
            key={k.key}
            kpi={k}
            lang={lang}
            open={open === k.key}
            editable={editable && !k.readOnly}
            onToggle={() => setOpen((o) => (o === k.key ? null : k.key))}
            url={`${url}/${encodeURIComponent(k.key)}`}
            onSaved={(next) => kpis.set(next)}
          />
        ))}
      </div>
    </div>
  );
}

const label = (k: KpiSeries, lang: Lang) => (lang === 'en' && k.labelEn ? k.labelEn : k.label);
const show = (k: KpiSeries, value: unknown, currency?: string) => attributeText(k.type, value, currency ?? k.currency);

function KpiCard({
  kpi,
  lang,
  open,
  editable,
  onToggle,
  url,
  onSaved,
}: {
  kpi: KpiSeries;
  lang: Lang;
  open: boolean;
  editable: boolean;
  onToggle: () => void;
  url: string;
  onSaved: (next: KpiSeries[]) => void;
}) {
  const w = (k: keyof typeof WORDS) => WORDS[k][lang];
  const last = kpi.points.at(-1);
  const numeric = kpi.type === 'number' || kpi.type === 'amount';
  return (
    <div className="rowcard stack" style={{ gap: 0, padding: 0 }}>
      <button className="row" style={{ padding: '10px 13px', gap: 10, width: '100%', textAlign: 'left', background: 'none', border: 0 }} onClick={onToggle}>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 13.5 }}>{label(kpi, lang)}</strong>
          <span className="faint" style={{ display: 'block', fontSize: 12 }}>
            {last ? `${show(kpi, last.value, last.currency)} · ${periodLabel(last.period, lang)}` : w('none')}
          </span>
        </span>
        {numeric && kpi.points.length > 1 && <Spark points={kpi.points} />}
      </button>
      {open && (
        <div className="stack" style={{ gap: 10, padding: '0 13px 12px 37px' }}>
          {numeric && kpi.points.length > 1 && <Curve kpi={kpi} lang={lang} />}
          {kpi.readOnly && <span className="faint" style={{ fontSize: 12 }}>{w('followed')}</span>}
          {kpi.points.length > 0 && (
            <table className="table" style={{ fontSize: 12.5 }}>
              <tbody>
                {[...kpi.points].reverse().map((p) => (
                  <tr key={p.period}>
                    <td style={{ width: 120 }}>{periodLabel(p.period, lang)}</td>
                    <td>
                      {kpi.type === 'file' && p.value ? (
                        <a href={`/api/uploads/${(p.value as AttributeFile).uploadId}`} target="_blank" rel="noreferrer">
                          {show(kpi, p.value)}
                        </a>
                      ) : (
                        show(kpi, p.value, p.currency)
                      )}
                    </td>
                    {editable && (
                      <td style={{ width: 40, textAlign: 'right' }}>
                        <RemovePoint url={`${url}/${p.period}`} lang={lang} onSaved={onSaved} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {editable && <AddPoint kpi={kpi} url={url} lang={lang} onSaved={onSaved} />}
        </div>
      )}
    </div>
  );
}

/** La petite courbe de la ligne : la tendance, sans les chiffres. */
function Spark({ points }: { points: KpiSeries['points'] }) {
  const ys = points.map((p) => Number(p.value)).filter(Number.isFinite);
  if (ys.length < 2) return null;
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const path = ys
    .map((y, i) => `${(i / (ys.length - 1)) * 70},${max === min ? 10 : 20 - ((y - min) / (max - min)) * 20}`)
    .join(' ');
  return (
    <svg width="72" height="22" viewBox="-1 -1 72 22" aria-hidden="true">
      <polyline points={path} fill="none" stroke="var(--accent, #2F5BFF)" strokeWidth="1.6" />
    </svg>
  );
}

/** La courbe ouverte : chaque période, sa valeur, et l'échelle de la plus basse à la plus haute. */
function Curve({ kpi, lang }: { kpi: KpiSeries; lang: Lang }) {
  const pts = kpi.points.filter((p) => Number.isFinite(Number(p.value)));
  const ys = pts.map((p) => Number(p.value));
  const min = Math.min(0, ...ys);
  const max = Math.max(...ys);
  const W = 520;
  const H = 150;
  const pad = { l: 8, r: 8, t: 18, b: 22 };
  const x = (i: number) => pad.l + (pts.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (pts.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (max === min ? (H - pad.t - pad.b) / 2 : (1 - (v - min) / (max - min)) * (H - pad.t - pad.b));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: 'auto' }} role="img" aria-label={label(kpi, lang)}>
      <line x1={pad.l} x2={W - pad.r} y1={y(min)} y2={y(min)} stroke="var(--line, #ddd)" />
      <polyline
        points={pts.map((p, i) => `${x(i)},${y(Number(p.value))}`).join(' ')}
        fill="none"
        stroke="var(--accent, #2F5BFF)"
        strokeWidth="2"
      />
      {pts.map((p, i) => (
        <g key={p.period}>
          <circle cx={x(i)} cy={y(Number(p.value))} r="3.5" fill="var(--accent, #2F5BFF)" />
          <text x={x(i)} y={y(Number(p.value)) - 7} fontSize="10" textAnchor="middle" fill="currentColor">
            {Number(p.value).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')}
          </text>
          <text x={x(i)} y={H - 6} fontSize="10" textAnchor="middle" fill="currentColor" opacity="0.6">
            {periodLabel(p.period, lang)}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** La période, dans la forme de sa périodicité. */
function PeriodInput({ kind, value, onChange }: { kind: KpiPeriod; value: string; onChange: (v: string) => void }) {
  if (kind === 'year') {
    return <input className="input num" style={{ width: 100 }} type="number" min={1950} max={2100} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  if (kind === 'quarter') {
    const [year, q] = value.split('-Q');
    return (
      <span className="row" style={{ gap: 6 }}>
        <select className="input" style={{ width: 80 }} value={q} onChange={(e) => onChange(`${year}-Q${e.target.value}`)}>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>Q{n}</option>
          ))}
        </select>
        <input className="input num" style={{ width: 90 }} type="number" min={1950} max={2100} value={year} onChange={(e) => onChange(`${e.target.value}-Q${q}`)} />
      </span>
    );
  }
  return <input className="input" style={{ width: 170 }} type={kind === 'month' ? 'month' : 'date'} value={value} onChange={(e) => onChange(e.target.value)} />;
}

function AddPoint({ kpi, url, lang, onSaved }: { kpi: KpiSeries; url: string; lang: Lang; onSaved: (next: KpiSeries[]) => void }) {
  const w = (k: keyof typeof WORDS) => WORDS[k][lang];
  const [adding, setAdding] = useState(false);
  const [period, setPeriod] = useState(currentPeriod(kpi.period));
  const [value, setValue] = useState<unknown>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  if (!adding) {
    return (
      <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(true)}>
        <Icon name="plus" size={12} /> {w('add')}
      </button>
    );
  }
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.put<KpiSeries[]>(`${url}/${period}`, { value }));
      toast(w('saved'));
      setAdding(false);
      setValue('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const taken = kpi.points.some((p) => p.period === period);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
        <div className="field" style={{ margin: 0 }}>
          <label>{w('period')}</label>
          <PeriodInput kind={kpi.period} value={period} onChange={setPeriod} />
        </div>
        <div className="field" style={{ margin: 0, flex: 1, minWidth: 160 }}>
          <label>{w('value')}</label>
          {kpi.type === 'file' ? (
            <FilePick lang={lang} value={value as AttributeFile | ''} onPicked={setValue} onError={setError} />
          ) : kpi.type === 'select' ? (
            <select className="input" value={String(value)} onChange={(e) => setValue(e.target.value)}>
              <option value="" />
              {kpi.options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <span className="row" style={{ gap: 6 }}>
              <input
                className="input"
                inputMode={kpi.type === 'number' || kpi.type === 'amount' ? 'decimal' : undefined}
                type={kpi.type === 'date' ? 'date' : 'text'}
                value={String(value)}
                onChange={(e) => setValue(e.target.value)}
              />
              {kpi.type === 'amount' && <span className="faint">{kpi.currency}</span>}
            </span>
          )}
        </div>
      </div>
      {taken && <span className="faint" style={{ fontSize: 12 }}>{w('replaces')}</span>}
      {error && <div className="err">{error}</div>}
      <div className="row" style={{ gap: 6 }}>
        <button className="btn primary sm" disabled={saving || value === ''} onClick={save}>
          {w('save')}
        </button>
        <button className="btn ghost sm" disabled={saving} onClick={() => setAdding(false)}>
          {w('cancel')}
        </button>
      </div>
    </div>
  );
}

function RemovePoint({ url, lang, onSaved }: { url: string; lang: Lang; onSaved: (next: KpiSeries[]) => void }) {
  const toast = useToast();
  return (
    <button
      className="btn ghost icon sm"
      aria-label={WORDS.remove[lang]}
      title={WORDS.remove[lang]}
      onClick={async () => {
        try {
          onSaved(await api.put<KpiSeries[]>(url, { value: null }));
        } catch (err) {
          toast((err as Error).message, true);
        }
      }}
    >
      <Icon name="x" size={12} />
    </button>
  );
}

function FilePick({
  lang,
  value,
  onPicked,
  onError,
}: {
  lang: Lang;
  value: AttributeFile | '';
  onPicked: (file: AttributeFile) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="btn sm" style={{ cursor: busy ? 'wait' : 'pointer', alignSelf: 'flex-start' }}>
      <Icon name="file" size={12} /> {value ? value.filename : WORDS.file[lang]}
      <input
        type="file"
        hidden
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          if (file.size > MAX_UPLOAD_BYTES) return onError(WORDS.tooBig[lang]);
          setBusy(true);
          try {
            const body = new FormData();
            body.append('fieldId', 'document');
            body.append('file', file);
            const res = await fetch('/api/public/uploads', { method: 'POST', body });
            if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Upload failed.');
            onPicked({ uploadId: ((await res.json()) as { id: string }).id, filename: file.name });
          } catch (err) {
            onError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </label>
  );
}
