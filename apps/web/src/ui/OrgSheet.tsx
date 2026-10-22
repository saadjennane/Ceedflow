/**
 * La fiche d'une organisation, telle qu'on la remplit.
 *
 * In sections rather than one long form: a founder answers what they know
 * today and comes back for the rest, and a page of forty fields reads as an
 * administrative ordeal however few of them are required. Each tab says how
 * far along it is, so coming back means going where something is left.
 *
 * Conditional, from the same rules the server and the jury's pane read
 * (profile.ts): a company being registered is not asked for a legal form, an
 * idea is not asked for its turnover, a patent nobody filed has no number to
 * give. What is not asked is not counted either.
 *
 * Every field saves itself — a choice at once, a text after a pause — so
 * "Finish later" loses nothing and there is no Save button to forget. One
 * editor for the founder and for CEED: they only differ by where it saves.
 */
import {
  COUNTRIES,
  CURRENCIES,
  LEGAL_FORMS,
  LEGAL_STATUSES,
  MATURITY_LEVELS,
  ORG_TYPES,
  PATENT_ANSWERS,
  PROFILE_SECTIONS,
  SECTORS,
  YES_NO,
  atMvp,
  citiesOf,
  isRegistered,
  profileDone,
  profileMissing,
  profileOf,
  revenueYears,
  sells,
  type Choice,
  type DirectoryRecord,
  type ProfileSection,
  type Revenue,
} from '@ceed/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, api } from '../lib/api';
import { say, useLang, type Lang, type Word } from '../lib/lang';
import { EmailLines } from './EmailLines';
import { Icon } from './Icon';
import { ASK_WORD, ProfileBar, RecordImage } from './OrgProfile';
import { Drawer, useToast } from './Overlays';
import { PhoneLines } from './PhoneLines';
import { PlaceLines } from './PlaceLines';

/** Le temps qu'on laisse finir un mot avant de l'enregistrer. */
const PAUSE = 700;

const SECTION_WORD: Record<ProfileSection, Word> = {
  identity: 'sheet.s.identity',
  activity: 'sheet.s.activity',
  team: 'sheet.s.team',
  maturity: 'sheet.s.maturity',
};

/** Where this editor writes: the founder's routes, or CEED's. */
export interface SheetRoutes {
  record: string;
  revenue: (year: number) => string;
}

/** Un entier ou rien : une case vidée veut dire « je ne sais pas », pas zéro. */
const numberOrNull = (text: string, whole = false): number | null => {
  const clean = text.replace(/\s/g, '').replace(',', '.');
  if (!clean) return null;
  const n = Number(clean);
  if (!Number.isFinite(n)) return null;
  return whole ? Math.round(n) : n;
};

export function OrgSheet({
  record: initial,
  routes,
  lang,
  onChanged,
  onClose,
}: {
  record: DirectoryRecord;
  routes: SheetRoutes;
  lang?: Lang;
  /** Each time the server has kept something — the page behind stays current. */
  onChanged: (record: DirectoryRecord) => void;
  onClose: () => void;
}) {
  const context = useLang();
  const l = lang ?? context.lang;
  const t = (w: Word) => say(w, l);
  const toast = useToast();

  const [draft, setDraft] = useState<DirectoryRecord>(initial);
  const [section, setSection] = useState<ProfileSection>(() => {
    /* On rouvre là où il reste quelque chose : revenir sur une fiche, c'est
       venir finir, pas relire ce qui est fait. */
    const p = profileOf(initial);
    return PROFILE_SECTIONS.find((s) => profileMissing(p, s).length > 0) ?? 'identity';
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(0);
  const [savedOnce, setSavedOnce] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const queued = useRef<Record<string, () => Promise<void>>>({});

  const profile = profileOf(draft);

  /** Sends one change, and keeps what the server answered. */
  const send = async (url: string, body: unknown, key: string, method: 'patch' | 'put') => {
    setPending((n) => n + 1);
    try {
      const saved =
        method === 'patch' ? await api.patch<DirectoryRecord>(url, body) : await api.put<DirectoryRecord>(url, body);
      setErrors(({ [key]: _gone, ...rest }) => rest);
      /* Le chiffre d'affaires vient du serveur ; le reste, de ce qu'on tape —
         une réponse lente ne doit pas réécrire un champ qu'on a continué à
         remplir pendant ce temps. */
      setDraft((d) => ({ ...d, revenues: saved.revenues }));
      setSavedOnce(true);
      onChanged(saved);
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        const message = Object.values(err.fields)[0] ?? err.message;
        setErrors((e) => ({ ...e, [key]: message }));
      } else {
        toast((err as Error).message, true);
      }
    } finally {
      setPending((n) => n - 1);
    }
  };

  /**
   * Change a field: on screen at once, on the server now or after a pause.
   *
   * A choice is an answer the moment it is made; a text is not, until the
   * person stops typing.
   */
  const put: Put = (patch, { wait = false } = {}) => {
    setDraft((d) => ({ ...d, ...patch }) as DirectoryRecord);
    const key = Object.keys(patch).join(',');
    clearTimeout(timers.current[key]);
    const go = () => {
      delete queued.current[key];
      return send(routes.record, patch, key, 'patch');
    };
    if (!wait) return void go();
    queued.current[key] = go;
    timers.current[key] = setTimeout(() => void go(), PAUSE);
  };

  const putRevenue = (year: number, next: Omit<Revenue, 'year'>, wait = false) => {
    setDraft((d) => ({
      ...d,
      revenues: [...d.revenues.filter((r) => r.year !== year), { year, ...next }].sort((a, b) => b.year - a.year),
    }));
    const key = `revenue:${year}`;
    clearTimeout(timers.current[key]);
    const go = () => {
      delete queued.current[key];
      return send(routes.revenue(year), next, key, 'put');
    };
    if (!wait) return void go();
    queued.current[key] = go;
    timers.current[key] = setTimeout(() => void go(), PAUSE);
  };

  /** Ce qui attend sa pause part tout de suite : on change de section, ou on s'en va. */
  const flush = async () => {
    for (const [key, go] of Object.entries(queued.current)) {
      clearTimeout(timers.current[key]);
      await go();
    }
  };

  /* Fermer l'onglet n'emporte pas le dernier mot tapé. */
  useEffect(() => {
    const leave = () => void flush();
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const at = PROFILE_SECTIONS.indexOf(section);
  const last = at === PROFILE_SECTIONS.length - 1;
  const go = async (next: ProfileSection) => {
    await flush();
    setSection(next);
  };
  const close = async () => {
    await flush();
    onClose();
  };

  const missingHere = profileMissing(profile, section);

  return (
    <Drawer
      wide
      title={draft.name}
      subtitle={t('sheet.why')}
      onClose={close}
      tabs={PROFILE_SECTIONS.map((s) => {
        const done = profileDone(profile, s);
        return (
          <button key={s} role="tab" className={s === section ? 'tab on' : 'tab'} onClick={() => go(s)}>
            {done === 100 ? <Icon name="check" size={12} /> : <span className="num faint">{done} %</span>}{' '}
            {t(SECTION_WORD[s])}
          </button>
        );
      })}
      footer={
        <>
          <span className="faint" style={{ fontSize: 12 }} role="status">
            {pending > 0 ? t('sheet.saving') : savedOnce ? `${t('sheet.saved')} ✓` : ''}
          </span>
          <div className="spacer" />
          <button className="btn ghost" onClick={close}>
            {t('sheet.later')}
          </button>
          <button className="btn primary" onClick={() => (last ? close() : go(PROFILE_SECTIONS[at + 1]!))}>
            {last ? t('sheet.finish') : t('sheet.next')}
            {!last && <Icon name="arrowRight" size={14} />}
          </button>
        </>
      }
    >
      <ProfileBar profile={profile} lang={l} />

      {section === 'identity' && (
        <Identity draft={draft} put={put} errors={errors} t={t} l={l} />
      )}
      {section === 'activity' && (
        <>
          <Area label={t('sheet.bio')} value={draft.bio} rows={6} error={errors.bio} onChange={(v) => put({ bio: v }, { wait: true })} />
          <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>{t('sheet.soon')}</p>
        </>
      )}
      {section === 'team' && (
        <>
          <NumberInput
            label={t('sheet.team')}
            value={draft.teamSize}
            whole
            error={errors.teamSize}
            onChange={(v) => put({ teamSize: v }, { wait: true })}
          />
          <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>{t('sheet.soon')}</p>
        </>
      )}
      {section === 'maturity' && (
        <MaturitySection draft={draft} put={put} putRevenue={putRevenue} errors={errors} t={t} l={l} />
      )}

      {/* Ce qui manque ici, nommé : seule la startup et CEED voient cette
          liste, jamais un lecteur de la fiche. */}
      {missingHere.length > 0 && (
        <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
          {t('sheet.missing')} {missingHere.map((k) => t(ASK_WORD[k])).join(', ')}.
        </p>
      )}
    </Drawer>
  );
}

/* Les valeurs viennent des listes de profile.ts ; le serveur les revérifie. */
type Put = (patch: { [K in keyof DirectoryRecord]?: unknown }, opts?: { wait?: boolean }) => void;
type T = (w: Word) => string;

/* ------------------------------------------------------------------ */
/* Section 1 — Identité & coordonnées                                  */
/* ------------------------------------------------------------------ */

function Identity({
  draft,
  put,
  errors,
  t,
  l,
}: {
  draft: DirectoryRecord;
  put: Put;
  errors: Record<string, string>;
  t: T;
  l: Lang;
}) {
  const p = profileOf(draft);
  const hq = draft.places[0] ?? { city: '', country: '', address: '' };
  const others = draft.places.slice(1);
  const setHq = (next: Partial<typeof hq>) => put({ places: [{ ...hq, ...next }, ...others] }, { wait: true });
  const legacySector = draft.sector && !SECTORS.some((s) => s.key === draft.sector);

  return (
    <>
      <RecordImage
        label="Logo"
        uploadId={draft.logoUploadId}
        name={draft.name}
        onChange={(v) => put({ logoUploadId: v })}
      />

      <Line
        label={t('sheet.name')}
        required
        value={draft.name}
        error={errors.name}
        onChange={(v) => {
          /* Un nom vidé ne part pas : une fiche sans nom ne se retrouve plus. */
          if (v.trim()) put({ name: v }, { wait: true });
        }}
      />

      <Area
        label={t('sheet.pitch')}
        required
        help={t('sheet.pitchHelp')}
        value={draft.pitch}
        max={300}
        rows={3}
        error={errors.pitch}
        onChange={(v) => put({ pitch: v }, { wait: true })}
      />

      <Pick label={t('sheet.orgType')} list={ORG_TYPES} value={draft.orgType} l={l} onChange={(v) => put({ orgType: v })} />
      <Pick
        label={t('sheet.legalStatus')}
        list={LEGAL_STATUSES}
        value={draft.legalStatus}
        l={l}
        onChange={(v) => put({ legalStatus: v })}
      />

      {draft.legalStatus === 'in_creation' && <p className="hint" style={{ margin: 0 }}>{t('sheet.inCreation')}</p>}

      {isRegistered(p) && (
        <div className="sheet-group">
          <div className="grid-2">
            <div className="field">
              <label>{t('sheet.founded')}</label>
              <input
                className="input"
                type="date"
                value={draft.foundedOn}
                onChange={(e) => put({ foundedOn: e.target.value })}
              />
              {errors.foundedOn && <div className="err">{errors.foundedOn}</div>}
            </div>
            <Select label={t('sheet.legalForm')} list={LEGAL_FORMS} value={draft.legalForm} l={l} t={t} onChange={(v) => put({ legalForm: v })} />
          </div>
          <div className="field">
            <label>{t('sheet.capital')}</label>
            <div className="row" style={{ gap: 6 }}>
              <NumberBox
                value={draft.capitalAmount}
                label={t('sheet.capital')}
                onChange={(v) => put({ capitalAmount: v }, { wait: true })}
              />
              <Currency value={draft.capitalCurrency} onChange={(v) => put({ capitalCurrency: v })} />
            </div>
            {errors.capitalAmount && <div className="err">{errors.capitalAmount}</div>}
          </div>
        </div>
      )}

      <div className="field">
        <label>{t('sheet.sector')}</label>
        <select className="input" value={draft.sector} onChange={(e) => put({ sector: e.target.value })}>
          <option value="">{t('sheet.choose')}</option>
          {/* Un secteur d'avant la liste reste lisible, jusqu'à ce qu'on en choisisse un. */}
          {legacySector && <option value={draft.sector}>{draft.sector} ({t('sheet.asTyped')})</option>}
          {SECTORS.map((s) => (
            <option key={s.key} value={s.key}>{s[l]}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>
          {t('sheet.sectors2')} <span className="faint" style={{ fontWeight: 400 }}>· {t('sheet.optional')}</span>
        </label>
        <div className="work-pick">
          {SECTORS.filter((s) => s.key !== draft.sector).map((s) => {
            const on = draft.secondarySectors.includes(s.key);
            return (
              <button
                key={s.key}
                type="button"
                className={on ? 'track on' : 'track'}
                onClick={() =>
                  put({
                    secondarySectors: on
                      ? draft.secondarySectors.filter((k) => k !== s.key)
                      : [...draft.secondarySectors, s.key],
                  })
                }
              >
                {s[l]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid-2">
        <Line label={t('sheet.website')} value={draft.website} placeholder="https://" onChange={(v) => put({ website: v }, { wait: true })} />
        <Line
          label={t('sheet.linkedin')}
          value={draft.linkedin}
          placeholder="https://www.linkedin.com/company/…"
          onChange={(v) => put({ linkedin: v }, { wait: true })}
        />
      </div>

      <Socials label={t('sheet.socials')} add={t('sheet.socialsAdd')} values={draft.socials} onChange={(v) => put({ socials: v }, { wait: true })} />

      <EmailLines label={t('sheet.email')} values={draft.emails} onChange={(v) => put({ emails: v }, { wait: true })} />
      {errors.emails && <div className="err">{errors.emails}</div>}
      <PhoneLines label={t('sheet.phone')} values={draft.phones} onChange={(v) => put({ phones: v }, { wait: true })} />
      {errors.phones && <div className="err">{errors.phones}</div>}

      <div className="sheet-group">
        <div className="field">
          <label>{t('sheet.hq')}</label>
          <div className="row" style={{ gap: 6 }}>
            <select
              className="input"
              style={{ flex: 1, minWidth: 0 }}
              value={hq.country}
              aria-label={`${t('sheet.hq')} — ${t('sheet.patentCountry')}`}
              onChange={(e) => setHq({ country: e.target.value })}
            >
              <option value="">{l === 'fr' ? 'Pays…' : 'Country…'}</option>
              {hq.country && !COUNTRIES.includes(hq.country as (typeof COUNTRIES)[number]) && (
                <option value={hq.country}>{hq.country}</option>
              )}
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              className="input"
              style={{ flex: 1, minWidth: 0 }}
              list="sheet-hq-cities"
              value={hq.city}
              placeholder={l === 'fr' ? 'Ville' : 'City'}
              onChange={(e) => setHq({ city: e.target.value })}
            />
            <datalist id="sheet-hq-cities">
              {citiesOf(hq.country).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>
        <Line label={t('sheet.address')} value={hq.address ?? ''} onChange={(v) => setHq({ address: v })} />
      </div>

      {/* Les autres implantations ne s'ouvrent qu'une fois le siège donné :
          sans lui, la première ville tapée ici deviendrait le siège. */}
      {(hq.city || hq.country) && (
        <PlaceLines
          label={`${t('sheet.otherPlaces')} · ${t('sheet.optional')}`}
          values={others}
          onChange={(next) => put({ places: [hq, ...next] }, { wait: true })}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Section 4 — Maturité & performances                                 */
/* ------------------------------------------------------------------ */

function MaturitySection({
  draft,
  put,
  putRevenue,
  errors,
  t,
  l,
}: {
  draft: DirectoryRecord;
  put: Put;
  putRevenue: (year: number, next: Omit<Revenue, 'year'>, wait?: boolean) => void;
  errors: Record<string, string>;
  t: T;
  l: Lang;
}) {
  const p = profileOf(draft);
  const details = draft.patentDetails ?? {};
  const setPatent = (next: Partial<typeof details>) => put({ patentDetails: { ...details, ...next } }, { wait: true });

  return (
    <>
      <div className="field">
        <label>{t('sheet.maturity')}</label>
        <div className="maturity-steps">
          {MATURITY_LEVELS.map((m, i) => (
            <button
              key={m.key}
              type="button"
              className={p.maturity === m.key ? 'maturity-step on' : 'maturity-step'}
              onClick={() => put({ maturity: p.maturity === m.key ? '' : m.key })}
            >
              <span className="num">{i + 1}</span> {m[l]}
            </button>
          ))}
        </div>
      </div>

      {(p.maturity === 'ideation' || p.maturity === 'prototype') && (
        <p className="hint" style={{ margin: 0 }}>{t('sheet.early')}</p>
      )}

      {atMvp(p) && (
        <Pick label={t('sheet.mvpUsers')} list={YES_NO} value={draft.mvpUsers} l={l} onChange={(v) => put({ mvpUsers: v })} />
      )}

      {sells(p) && (
        <div className="sheet-group">
          <div className="field">
            <label>{t('sheet.revenues')}</label>
            <div className="help">{t('sheet.revenuesHelp')}</div>
            <div className="stack" style={{ gap: 6, marginTop: 4 }}>
              {revenueYears(p).map((year) => {
                const row = draft.revenues.find((r) => r.year === year);
                const currency = row?.currency || draft.capitalCurrency || 'MAD';
                return (
                  <div className="row" key={year} style={{ gap: 8 }}>
                    <strong className="num" style={{ width: 44 }}>{year}</strong>
                    <NumberBox
                      label={`${t('sheet.revenues')} ${year}`}
                      value={row?.unavailable ? null : (row?.amount ?? null)}
                      disabled={row?.unavailable}
                      onChange={(v) => putRevenue(year, { amount: v, unavailable: false, currency }, true)}
                    />
                    <Currency
                      value={currency}
                      onChange={(v) => putRevenue(year, { amount: row?.amount ?? null, unavailable: row?.unavailable ?? false, currency: v })}
                    />
                    <label className="check" style={{ whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={row?.unavailable ?? false}
                        onChange={(e) => putRevenue(year, { amount: null, unavailable: e.target.checked, currency })}
                      />
                      <span>{t('sheet.unavailable')}</span>
                    </label>
                  </div>
                );
              })}
            </div>
            {Object.entries(errors)
              .filter(([k]) => k.startsWith('revenue:'))
              .map(([k, m]) => (
                <div className="err" key={k}>{m}</div>
              ))}
          </div>

          <NumberInput
            label={t('sheet.clients')}
            value={draft.activeClients}
            whole
            error={errors.activeClients}
            onChange={(v) => put({ activeClients: v }, { wait: true })}
          />

          <Pick
            label={t('sheet.contracts')}
            list={YES_NO}
            value={draft.signedContracts}
            l={l}
            onChange={(v) => put({ signedContracts: v })}
          />
          {draft.signedContracts === 'yes' && (
            <div className="grid-2">
              <NumberInput
                label={t('sheet.contractsCount')}
                value={draft.contractsCount}
                whole
                onChange={(v) => put({ contractsCount: v }, { wait: true })}
              />
              <NumberInput
                label={`${t('sheet.contractsAmount')} (${draft.capitalCurrency || 'MAD'})`}
                value={draft.contractsAmount}
                onChange={(v) => put({ contractsAmount: v }, { wait: true })}
              />
            </div>
          )}
        </div>
      )}

      <Pick label={t('sheet.patent')} list={PATENT_ANSWERS} value={draft.patent} l={l} onChange={(v) => put({ patent: v })} />
      {draft.patent === 'yes' && (
        <div className="sheet-group">
          <div className="grid-2">
            <Line label={t('sheet.patentNumber')} value={details.number ?? ''} onChange={(v) => setPatent({ number: v })} />
            <div className="field">
              <label>{t('sheet.patentDate')}</label>
              <input className="input" type="date" value={details.date ?? ''} onChange={(e) => setPatent({ date: e.target.value })} />
            </div>
          </div>
          <div className="grid-2">
            <Line label={t('sheet.patentCountry')} value={details.country ?? ''} onChange={(v) => setPatent({ country: v })} />
            <Line label={t('sheet.patentOffice')} value={details.office ?? ''} placeholder="OMPIC" onChange={(v) => setPatent({ office: v })} />
          </div>
        </div>
      )}
      {draft.patent === 'pending' && (
        <Line label={t('sheet.patentProcedure')} value={details.procedure ?? ''} onChange={(v) => setPatent({ procedure: v })} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Small controls                                                      */
/* ------------------------------------------------------------------ */

/** A closed list as buttons: re-pressing the chosen one undoes it. */
function Pick({
  label,
  list,
  value,
  l,
  onChange,
}: {
  label: string;
  list: readonly Choice[];
  value: string;
  l: Lang;
  onChange: (v: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="work-pick">
        {list.map((c) => (
          <button
            key={c.key}
            type="button"
            className={value === c.key ? 'track on' : 'track'}
            onClick={() => onChange(value === c.key ? '' : c.key)}
          >
            {c[l]}
          </button>
        ))}
      </div>
    </div>
  );
}

function Select({
  label,
  list,
  value,
  l,
  t,
  onChange,
}: {
  label: string;
  list: readonly Choice[];
  value: string;
  l: Lang;
  t: T;
  onChange: (v: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('sheet.choose')}</option>
        {list.map((c) => (
          <option key={c.key} value={c.key}>{c[l]}</option>
        ))}
      </select>
    </div>
  );
}

function Currency({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className="input" style={{ width: 86, flex: 'none' }} value={value || 'MAD'} aria-label="Currency" onChange={(e) => onChange(e.target.value)}>
      {CURRENCIES.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  );
}

function Line({
  label,
  value,
  onChange,
  placeholder,
  error,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
}) {
  /* Le texte vit ici pendant qu'on écrit : un nom vidé, qu'on refuse
     d'envoyer, doit quand même pouvoir être retapé. */
  const [text, setText] = useState(value);
  return (
    <div className="field">
      <label>
        {label}
        {required && <span style={{ color: 'var(--stop)' }}> *</span>}
      </label>
      <input
        className={error ? 'input bad' : 'input'}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
      />
      {error && <div className="err">{error}</div>}
    </div>
  );
}

function Area({
  label,
  value,
  onChange,
  help,
  max,
  rows = 3,
  error,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: string;
  max?: number;
  rows?: number;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="field">
      <label>
        {label}
        {required && <span style={{ color: 'var(--stop)' }}> *</span>}
        {max && (
          <span className="faint num" style={{ fontWeight: 400, float: 'right' }}>
            {value.length}/{max}
          </span>
        )}
      </label>
      {help && <div className="help">{help}</div>}
      <textarea
        className="textarea"
        rows={rows}
        value={value}
        maxLength={max}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <div className="err">{error}</div>}
    </div>
  );
}

/** A number box that keeps what is typed — "12 5" mid-way — and hands back a number or nothing. */
function NumberBox({
  value,
  onChange,
  label,
  disabled,
  whole,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
  disabled?: boolean;
  whole?: boolean;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => {
    /* Remis à blanc de l'extérieur — « non disponible » coché — et seulement
       alors : sinon chaque frappe réécrirait ce qu'on tape. */
    if (value === null && disabled) setText('');
  }, [value, disabled]);
  return (
    <input
      className="input num"
      inputMode="decimal"
      aria-label={label}
      style={{ flex: 1, minWidth: 0 }}
      value={text}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        onChange(numberOrNull(e.target.value, whole));
      }}
    />
  );
}

function NumberInput({
  label,
  value,
  onChange,
  whole,
  error,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  whole?: boolean;
  error?: string;
}): ReactNode {
  return (
    <div className="field">
      <label>{label}</label>
      <NumberBox label={label} value={value} whole={whole} onChange={onChange} />
      {error && <div className="err">{error}</div>}
    </div>
  );
}

/** Other networks, one address a line. LinkedIn has its own field above. */
function Socials({
  label,
  add,
  values,
  onChange,
}: {
  label: string;
  add: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [lines, setLines] = useState<string[]>(values.length ? values : []);
  const set = (next: string[]) => {
    setLines(next);
    onChange(next);
  };
  return (
    <div className="field">
      <label>{label}</label>
      <div className="stack" style={{ gap: 6 }}>
        {lines.map((line, i) => (
          <div className="row" key={i} style={{ gap: 6 }}>
            <input
              className="input"
              value={line}
              placeholder="https://instagram.com/…"
              onChange={(e) => set(lines.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button className="btn ghost icon sm" aria-label="Remove" onClick={() => set(lines.filter((_, j) => j !== i))}>
              <Icon name="x" size={13} />
            </button>
          </div>
        ))}
      </div>
      <button className="btn sm" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={() => setLines([...lines, ''])}>
        <Icon name="plus" size={13} /> {add}
      </button>
    </div>
  );
}
