/**
 * Une question reliée à la fiche startup.
 *
 * Added from the sheet rather than typed: its name, its type and its choices
 * come from the attribute, the form opens on what the sheet says today, and
 * the answer sent goes back to it. A KPI asks for one period — the turnover of
 * 2025 — or, left empty, for the period of the day it is sent.
 */
import {
  FIXED_KPIS,
  LEGAL_FORMS,
  MATURITY_LEVELS,
  ORG_TYPES,
  PROFILE_SOURCES,
  SECTORS,
  TARGET_MARKETS,
  idOf,
  periodLabel,
  type Choice,
  type FieldType,
  type FixedKpiSetting,
  type FormField,
  type KpiPeriod,
  type OrgAttribute,
} from '@ceed/shared';
import { useState } from 'react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Icon } from './Icon';

export interface SheetSource {
  key: string;
  label: string;
  group: 'Sheet' | 'Added by CEED' | 'KPIs';
  type: FieldType;
  options: string[];
  /** For a KPI: its periodicity, to ask for one period. */
  kpiPeriod?: KpiPeriod;
}

/** Les listes de la fiche, en français — la fiche les retrouve aussi en anglais. */
const LISTS: Record<string, readonly Choice[]> = {
  sector: SECTORS,
  maturity: MATURITY_LEVELS,
  orgType: ORG_TYPES,
  legalForm: LEGAL_FORMS,
  targetMarkets: TARGET_MARKETS,
};

const asField = (type: string): FieldType => (type === 'amount' ? 'number' : (type as FieldType));

/** Tout ce qu'une question peut reprendre de la fiche. */
export function useSheetSources(): SheetSource[] {
  const added = useAsync(() => api.get<OrgAttribute[]>('/api/org-attributes'), 'org-attributes');
  const kpis = useAsync(() => api.get<FixedKpiSetting[]>('/api/kpi-settings'), 'kpi-settings');
  const out: SheetSource[] = [];
  for (const s of PROFILE_SOURCES) {
    const list = LISTS[s.key];
    const type: FieldType = list ? (s.key === 'targetMarkets' ? 'multiselect' : 'select') : (s.types[0] as FieldType);
    out.push({ key: s.key, label: s.fr, group: 'Sheet', type, options: list ? list.map((c) => c.fr) : [] });
  }
  for (const a of (added.data ?? []).filter((x) => !x.archived)) {
    out.push({ key: `attr:${a.id}`, label: a.label, group: 'Added by CEED', type: asField(a.type), options: a.options });
    if (a.kpiPeriod) {
      out.push({ key: `kpi:attr:${a.id}`, label: a.label, group: 'KPIs', type: asField(a.type), options: a.options, kpiPeriod: a.kpiPeriod });
    }
  }
  for (const k of kpis.data ?? []) {
    const fixed = FIXED_KPIS.find((f) => f.key === k.key);
    if (!k.period || !fixed || 'computed' in fixed) continue;
    out.push({ key: `kpi:${k.key}`, label: fixed.fr, group: 'KPIs', type: asField(fixed.type), options: [], kpiPeriod: k.period });
  }
  return out;
}

/** Une question neuve, reprise de la fiche. */
export function fieldFromSource(source: SheetSource, pageId: string): FormField {
  return {
    id: idOf.field(),
    type: source.type,
    label: source.label,
    help: '',
    required: false,
    options: source.options,
    showInTable: false,
    pageId,
    fromProfile: source.key,
    fromPeriod: source.kpiPeriod ? '' : undefined,
  };
}

/** « From the sheet » : à côté de « Add question ». */
export function SheetSourceMenu({ sources, onPick, compact }: { sources: SheetSource[]; onPick: (s: SheetSource) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const shown = sources.filter((s) => !q || s.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="menu-anchor">
      <button className="btn sm" onClick={() => setOpen((v) => !v)} title="A question that reads and updates the startup’s sheet">
        <Icon name="link" size={13} /> {compact ? 'From the sheet' : 'Add from the startup sheet'}
      </button>
      {open && (
        <>
          <div className="menu-catch" onClick={() => setOpen(false)} />
          <div className="menu" style={{ width: 280, maxHeight: 360, overflowY: 'auto' }}>
            <div style={{ padding: 6 }}>
              <input className="input" autoFocus placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {(['Sheet', 'Added by CEED', 'KPIs'] as const).map((group) => {
              const items = shown.filter((s) => s.group === group);
              if (!items.length) return null;
              return (
                <div key={group}>
                  <div className="eyebrow" style={{ padding: '6px 10px 2px' }}>{group}</div>
                  {items.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => {
                        setOpen(false);
                        setQ('');
                        onPick(s);
                      }}
                    >
                      <Icon name={s.group === 'KPIs' ? 'board' : 'link'} />
                      <div>
                        <strong>{s.label}</strong>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** Ce qu'une question reliée dit d'elle-même dans l'éditeur — et la période d'un KPI. */
export function SheetLinkNote({
  field,
  sources,
  onChange,
}: {
  field: FormField;
  sources: SheetSource[];
  onChange: (partial: Partial<FormField>) => void;
}) {
  const source = sources.find((s) => s.key === field.fromProfile);
  return (
    <div className="callout" style={{ fontSize: 12.5 }}>
      <Icon name="link" size={14} />
      <div className="stack" style={{ gap: 6, flex: 1 }}>
        <span>
          Linked to the startup sheet — <strong>{source?.label ?? field.fromProfile}</strong>. The form opens on what the
          sheet says, and the answer sent updates it.
        </span>
        {source?.kpiPeriod && (
          <label className="row wrap" style={{ gap: 6 }}>
            <span>Period asked</span>
            <input
              className="input"
              style={{ width: 130 }}
              value={field.fromPeriod ?? ''}
              placeholder={source.kpiPeriod === 'year' ? '2025' : source.kpiPeriod === 'quarter' ? '2025-Q4' : source.kpiPeriod === 'month' ? '2025-12' : '2025-12-31'}
              onChange={(e) => onChange({ fromPeriod: e.target.value.trim() })}
            />
            <span className="faint">
              {field.fromPeriod ? periodLabel(field.fromPeriod) : 'Empty: the period of the day it is sent.'}
            </span>
          </label>
        )}
        <button
          className="linkish"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => onChange({ fromProfile: undefined, fromPeriod: undefined })}
        >
          Unlink — keep it as a plain question
        </button>
      </div>
    </div>
  );
}
