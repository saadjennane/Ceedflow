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
  ACTIVITY_NATURES,
  AFFILIATION_ROLES,
  COUNTRIES,
  CURRENCIES,
  FUNDING_NATURES,
  PRODUCT_STATUSES,
  PROGRAM_STATUSES,
  SALES_ZONES,
  TARGET_MARKETS,
  abroad,
  accompanied,
  choiceLabel,
  digital,
  fundingTotals,
  isFounderRole,
  teamProblems,
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
  type SheetList,
  type TeamMember,
} from '@ceed/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, api } from '../lib/api';
import { say, useLang, type Lang, type Word } from '../lib/lang';
import { EmailLines } from './EmailLines';
import { Icon } from './Icon';
import { PeoplePicker } from '../pages/directory/PeoplePicker';
import { ASK_WORD, ProfileBar, RecordImage, money } from './OrgProfile';
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
  funding: 'sheet.s.funding',
};

/** Where this editor writes: the founder's routes, or CEED's. */
export interface SheetRoutes {
  record: string;
  revenue: (year: number) => string;
  /** One line of a list: the list itself to add, or one of its lines. */
  list: (list: SheetList, itemId?: string) => string;
  /** Who is on the page, and how one of them is changed. */
  team: string;
  affiliation: (affiliationId: string) => string;
  /**
   * How somebody joins the page. A founder names a person — found again by
   * their address if the directory knows them — and never searches the whole
   * directory; CEED picks from it.
   */
  join: { kind: 'member'; url: string } | { kind: 'staff'; orgId: string };
  /** Whether this reader may change roles and the main contact. */
  manageTeam: boolean;
}

/** Les listes que le serveur renvoie avec la fiche, et que l'écran reprend telles quelles. */
const SERVER_LISTS = ['revenues', 'products', 'fundings', 'programs', 'ceedPrograms'] as const;

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
  const send = async (url: string, body: unknown, key: string, method: 'patch' | 'put' | 'post' | 'del') => {
    setPending((n) => n + 1);
    try {
      const saved =
        method === 'patch'
          ? await api.patch<DirectoryRecord>(url, body)
          : method === 'put'
            ? await api.put<DirectoryRecord>(url, body)
            : method === 'post'
              ? await api.post<DirectoryRecord>(url, body)
              : await api.del<DirectoryRecord>(url);
      setErrors(({ [key]: _gone, ...rest }) => rest);
      /* Le chiffre d'affaires vient du serveur ; le reste, de ce qu'on tape —
         une réponse lente ne doit pas réécrire un champ qu'on a continué à
         remplir pendant ce temps. */
      setDraft((d) => ({ ...d, ...Object.fromEntries(SERVER_LISTS.map((k) => [k, saved[k]])) }));
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

  /** One line of a list: added, changed after a pause, or removed. */
  const lines: Lines = {
    add: (list, input) => send(routes.list(list), input, `${list}:new`, 'post'),
    change: (list, id, patch) => {
      const key = `${list}:${id}`;
      clearTimeout(timers.current[key]);
      const go = () => {
        delete queued.current[key];
        return send(routes.list(list, id), patch, key, 'patch');
      };
      queued.current[key] = go;
      timers.current[key] = setTimeout(() => void go(), PAUSE);
    },
    drop: (list, id) => send(routes.list(list, id), undefined, `${list}:${id}`, 'del'),
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
      {section === 'activity' && <Activity draft={draft} put={put} lines={lines} errors={errors} t={t} l={l} />}
      {section === 'team' && <Team draft={draft} put={put} routes={routes} errors={errors} t={t} l={l} />}
      {section === 'funding' && <FundingSection draft={draft} put={put} lines={lines} t={t} l={l} />}
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

interface Lines {
  add: (list: SheetList, input: Record<string, unknown>) => Promise<void>;
  change: (list: SheetList, id: string, patch: Record<string, unknown>) => void;
  drop: (list: SheetList, id: string) => Promise<void>;
}
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
/* Section 2 — Activité & produits                                     */
/* ------------------------------------------------------------------ */

function Activity({
  draft,
  put,
  lines,
  errors,
  t,
  l,
}: {
  draft: DirectoryRecord;
  put: Put;
  lines: Lines;
  errors: Record<string, string>;
  t: T;
  l: Lang;
}) {
  const p = profileOf(draft);
  const toggleMarket = (key: string) =>
    put({
      targetMarkets: draft.targetMarkets.includes(key)
        ? draft.targetMarkets.filter((k) => k !== key)
        : [...draft.targetMarkets, key],
    });

  return (
    <>
      <Area label={t('sheet.bio')} value={draft.bio} rows={5} error={errors.bio} onChange={(v) => put({ bio: v }, { wait: true })} />

      <Pick label={t('sheet.nature')} list={ACTIVITY_NATURES} value={draft.activityNature} l={l} onChange={(v) => put({ activityNature: v })} />

      <div className="field">
        <label>{t('sheet.markets')}</label>
        <div className="work-pick">
          {TARGET_MARKETS.map((m) => (
            <button
              key={m.key}
              type="button"
              className={draft.targetMarkets.includes(m.key) ? 'track on' : 'track'}
              onClick={() => toggleMarket(m.key)}
            >
              {m[l]}
            </button>
          ))}
        </div>
      </div>

      <Area label={t('sheet.offering')} value={draft.mainOffering} rows={3} onChange={(v) => put({ mainOffering: v }, { wait: true })} />

      <div className="grid-2">
        <Line label={`${t('sheet.catalogue')} · ${t('sheet.optional')}`} value={draft.catalogueUrl} placeholder="https://" onChange={(v) => put({ catalogueUrl: v }, { wait: true })} />
        {digital(p) && (
          <Line label={`${t('sheet.demo')} · ${t('sheet.optional')}`} value={draft.demoUrl} placeholder="https://" onChange={(v) => put({ demoUrl: v }, { wait: true })} />
        )}
      </div>

      <Pick label={t('sheet.zone')} list={SALES_ZONES} value={draft.salesZone} l={l} onChange={(v) => put({ salesZone: v })} />
      {abroad(p) && (
        <div className="sheet-group">
          <div className="field">
            <label>{t('sheet.countries')}</label>
            {draft.salesCountries.length > 0 && (
              <div className="row wrap" style={{ gap: 5, marginBottom: 6 }}>
                {draft.salesCountries.map((c) => (
                  <span className="badge" key={c}>
                    {c}{' '}
                    <button
                      className="linkish"
                      aria-label={`${t('sheet.remove')} ${c}`}
                      onClick={() => put({ salesCountries: draft.salesCountries.filter((x) => x !== c) })}
                    >
                      <Icon name="x" size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <select
              className="input"
              value=""
              onChange={(e) => e.target.value && put({ salesCountries: [...draft.salesCountries, e.target.value] })}
            >
              <option value="">{t('sheet.countryAdd')}</option>
              {COUNTRIES.filter((c) => !draft.salesCountries.includes(c)).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="field">
        <label>{t('sheet.products')}</label>
        <div className="stack" style={{ gap: 8 }}>
          {draft.products.map((product) => (
            <ProductCard key={product.id} product={product} lines={lines} t={t} l={l} />
          ))}
        </div>
        <NewLine
          label={t('sheet.productAdd')}
          placeholder={t('sheet.productName')}
          t={t}
          onAdd={(name) => lines.add('products', { name })}
        />
      </div>
    </>
  );
}

/** Un produit : ce qu'on y tape reste à l'écran, et part après une pause. */
function ProductCard({ product, lines, t, l }: { product: DirectoryRecord['products'][number]; lines: Lines; t: T; l: Lang }) {
  const [p, setP] = useState(product);
  const set = (patch: Partial<typeof p>) => {
    setP((x) => ({ ...x, ...patch }));
    lines.change('products', product.id, patch);
  };
  return (
    <div className="rowcard card-pad stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8 }}>
        <input
          className="input"
          style={{ flex: 1, fontWeight: 600 }}
          value={p.name}
          aria-label={t('sheet.productName')}
          onChange={(e) => {
            setP((x) => ({ ...x, name: e.target.value }));
            if (e.target.value.trim()) lines.change('products', product.id, { name: e.target.value });
          }}
        />
        <Remove t={t} onRemove={() => lines.drop('products', product.id)} />
      </div>
      <textarea
        className="textarea"
        rows={2}
        placeholder={t('sheet.productDesc')}
        value={p.description}
        onChange={(e) => set({ description: e.target.value })}
      />
      <div className="grid-2">
        <div className="field">
          <label>{t('sheet.productStatus')}</label>
          <select className="input" value={p.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">{t('sheet.choose')}</option>
            {PRODUCT_STATUSES.map((c) => (
              <option key={c.key} value={c.key}>{c[l]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t('sheet.productPrice')} · {t('sheet.optional')}</label>
          <input className="input" value={p.price} placeholder="200 MAD / mois" onChange={(e) => set({ price: e.target.value })} />
        </div>
      </div>
      <RecordImage
        label={`${t('sheet.productImage')} · ${t('sheet.optional')}`}
        uploadId={p.imageUploadId}
        name={p.name}
        onChange={(v) => {
          setP((x) => ({ ...x, imageUploadId: v }));
          lines.change('products', product.id, { imageUploadId: v });
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section 3 — Équipe                                                  */
/* ------------------------------------------------------------------ */

function Team({
  draft,
  put,
  routes,
  errors,
  t,
  l,
}: {
  draft: DirectoryRecord;
  put: Put;
  routes: SheetRoutes;
  errors: Record<string, string>;
  t: T;
  l: Lang;
}) {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const load = () => void api.get<TeamMember[]>(routes.team).then(setTeam).catch(() => setTeam([]));
  useEffect(load, [routes.team]);

  /* L'incohérence se dit avant l'envoi : le serveur la refusera de toute façon. */
  const wrong = teamProblems(profileOf(draft));
  const linked = (team ?? []).filter((m) => isFounderRole(m.role)).length;
  const gap = team !== null && draft.foundersCount !== null && linked > 0 && linked !== draft.foundersCount;

  const change = async (member: TeamMember, patch: { role?: string; primary?: boolean }) => {
    try {
      const next = await api.patch<TeamMember[] | unknown>(routes.affiliation(member.affiliationId), patch);
      if (Array.isArray(next)) setTeam(next as TeamMember[]);
      else load();
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  return (
    <>
      <div className="grid-3">
        <NumberInput label={t('sheet.founders')} value={draft.foundersCount} whole onChange={(v) => put({ foundersCount: v }, { wait: true })} />
        <NumberInput label={t('sheet.team')} value={draft.teamSize} whole error={errors.teamSize} onChange={(v) => put({ teamSize: v }, { wait: true })} />
        <NumberInput
          label={t('sheet.women')}
          value={draft.womenCount}
          whole
          error={wrong.womenCount ?? errors.womenCount}
          onChange={(v) => put({ womenCount: v }, { wait: true })}
        />
      </div>

      {gap && (
        <p className="hint" style={{ margin: 0 }}>
          <Icon name="alert" size={12} /> {t('sheet.foundersGap')} {draft.foundersCount} / {linked} {t('sheet.foundersLinked')}.
        </p>
      )}

      <div className="field">
        <label>{t('sheet.people')}</label>
        <div className="help">{t('sheet.peopleHelp')}</div>
        <div className="stack" style={{ gap: 6, marginTop: 4 }}>
          {(team ?? []).map((member) => {
            const known = AFFILIATION_ROLES.some((r) => r.key === member.role);
            return (
              <div className="rowcard row" key={member.affiliationId} style={{ gap: 8, padding: '8px 10px' }}>
                {member.person.logoUploadId ? (
                  <img className="rec-photo" src={`/api/uploads/${member.person.logoUploadId}`} alt="" />
                ) : (
                  <span className="rec-mark">{member.person.name.slice(0, 2).toUpperCase()}</span>
                )}
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 }}>{member.person.name}</span>
                {routes.manageTeam ? (
                  <select
                    className="input"
                    style={{ width: 150, flex: 'none' }}
                    aria-label={`${t('sheet.role')} — ${member.person.name}`}
                    value={member.role}
                    onChange={(e) => change(member, { role: e.target.value })}
                  >
                    <option value="">{t('sheet.role')}…</option>
                    {/* Un rôle d'avant la liste reste lisible tel quel. */}
                    {!known && member.role && <option value={member.role}>{member.role}</option>}
                    {AFFILIATION_ROLES.map((r) => (
                      <option key={r.key} value={r.key}>{r[l]}</option>
                    ))}
                  </select>
                ) : (
                  <span className="faint" style={{ fontSize: 12.5 }}>{choiceLabel(AFFILIATION_ROLES, member.role, l)}</span>
                )}
                <label className="check" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                  <input
                    type="radio"
                    name="primary-contact"
                    checked={member.primary}
                    disabled={!routes.manageTeam}
                    onChange={() => change(member, { primary: true })}
                  />
                  <span>{t('sheet.primary')}</span>
                </label>
              </div>
            );
          })}
        </div>
        {!routes.manageTeam && <p className="faint" style={{ margin: '6px 0 0', fontSize: 12 }}>{t('sheet.onlyAdmin')}</p>}
        {routes.manageTeam &&
          (adding ? (
            <JoinPerson
              routes={routes}
              t={t}
              l={l}
              onDone={(changed) => {
                setAdding(false);
                if (changed) load();
              }}
            />
          ) : (
            <button className="btn sm" style={{ alignSelf: 'flex-start', marginTop: 8 }} onClick={() => setAdding(true)}>
              <Icon name="plus" size={13} /> {t('sheet.personAdd')}
            </button>
          ))}
      </div>
    </>
  );
}

/**
 * Associer quelqu'un : par son adresse côté startup, par l'annuaire côté CEED.
 *
 * Jamais une seconde fiche pour la même personne — la startup la retrouve par
 * son email, CEED la choisit dans l'annuaire — et le lien porte le rôle, pas
 * la personne : on peut être fondatrice ici et mentor ailleurs.
 */
function JoinPerson({ routes, t, l, onDone }: { routes: SheetRoutes; t: T; l: Lang; onDone: (changed: boolean) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [role, setRole] = useState('employee');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const save = async () => {
    setBusy(true);
    try {
      if (routes.join.kind === 'member') {
        await api.post(routes.join.url, { name, emails: email ? [email] : [], role, access: 'member' });
      } else {
        for (const personId of picked) await api.post('/api/affiliations', { personId, orgId: routes.join.orgId, role });
      }
      onDone(true);
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-group" style={{ marginTop: 8 }}>
      {routes.join.kind === 'member' ? (
        <>
          <div className="grid-2">
            <div className="field">
              <label>{t('sheet.personName')}</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>{t('sheet.personEmail')}</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <p className="hint" style={{ margin: 0 }}>{t('sheet.personFound')}</p>
        </>
      ) : (
        <PeoplePicker label={t('sheet.personName')} value={picked} onChange={setPicked} />
      )}
      <div className="row" style={{ gap: 8 }}>
        <select className="input" style={{ width: 170, flex: 'none' }} aria-label={t('sheet.role')} value={role} onChange={(e) => setRole(e.target.value)}>
          {AFFILIATION_ROLES.map((r) => (
            <option key={r.key} value={r.key}>{r[l]}</option>
          ))}
        </select>
        <div className="spacer" />
        <button className="btn ghost sm" onClick={() => onDone(false)}>{t('sheet.cancel')}</button>
        <button
          className="btn primary sm"
          disabled={busy || (routes.join.kind === 'member' ? !name.trim() : !picked.length)}
          onClick={save}
        >
          {t('sheet.add')}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section 5 — Financement & accompagnement                            */
/* ------------------------------------------------------------------ */

function FundingSection({
  draft,
  put,
  lines,
  t,
  l,
}: {
  draft: DirectoryRecord;
  put: Put;
  lines: Lines;
  t: T;
  l: Lang;
}) {
  const p = profileOf(draft);
  const totals = fundingTotals(draft.fundings);
  return (
    <>
      <Pick label={t('sheet.hasFunding')} list={YES_NO} value={draft.hasFunding} l={l} onChange={(v) => put({ hasFunding: v })} />
      {draft.hasFunding === 'yes' && (
        <div className="sheet-group">
          <div className="field">
            <label>{t('sheet.fundings')}</label>
            <div className="stack" style={{ gap: 8 }}>
              {draft.fundings.map((f) => (
                <FundingCard key={f.id} funding={f} lines={lines} t={t} l={l} />
              ))}
            </div>
            <button
              className="btn sm"
              style={{ alignSelf: 'flex-start', marginTop: 8 }}
              onClick={() => lines.add('fundings', { currency: draft.capitalCurrency || 'MAD' })}
            >
              <Icon name="plus" size={13} /> {t('sheet.fundingAdd')}
            </button>
          </div>
          {/* Par devise et par nature : le capital, les subventions et le reste
              ne s'additionnent jamais entre eux sous un seul mot. */}
          {totals.length > 0 && (
            <div className="field">
              <label>{t('sheet.totals')}</label>
              {totals.map((row) => (
                <div className="view-tiles" key={row.currency} style={{ marginTop: 4 }}>
                  {(
                    [
                      ['sheet.totalEquity', row.equity],
                      ['sheet.totalGrant', row.grant],
                      ['sheet.totalOther', row.other],
                      ['sheet.totalAll', row.total],
                    ] as const
                  ).map(([word, amount]) => (
                    <div className="view-tile" key={word}>
                      <div className="eyebrow">{t(word)}</div>
                      <div className="view-tile-value num" style={{ fontSize: 15 }}>{money(amount, row.currency, l)}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Pick label={t('sheet.pastPrograms')} list={YES_NO} value={draft.pastPrograms} l={l} onChange={(v) => put({ pastPrograms: v })} />
      <Pick label={t('sheet.currentPrograms')} list={YES_NO} value={draft.currentPrograms} l={l} onChange={(v) => put({ currentPrograms: v })} />

      {(accompanied(p) || draft.ceedPrograms.length > 0) && (
        <div className="sheet-group">
          {draft.ceedPrograms.length > 0 && (
            <div className="field">
              <label>{t('sheet.ceedPrograms')}</label>
              <div className="help">{t('sheet.ceedProgramsHelp')}</div>
              {draft.ceedPrograms.map((c) => (
                <div key={c.editionId} style={{ fontSize: 13 }}>
                  <strong>{c.program}</strong> · {c.edition}{' '}
                  <span className={c.done ? 'badge' : 'badge ok'}>{choiceLabel(PROGRAM_STATUSES, c.done ? 'done' : 'ongoing', l)}</span>
                </div>
              ))}
            </div>
          )}
          {accompanied(p) && (
            <div className="field">
              <label>{t('sheet.programs')}</label>
              <div className="stack" style={{ gap: 8 }}>
                {draft.programs.map((g) => (
                  <ProgramCard key={g.id} program={g} lines={lines} t={t} l={l} />
                ))}
              </div>
              <NewLine label={t('sheet.programAdd')} placeholder={t('sheet.programName')} t={t} onAdd={(name) => lines.add('programs', { name })} />
            </div>
          )}
        </div>
      )}
    </>
  );
}

function FundingCard({ funding, lines, t, l }: { funding: DirectoryRecord['fundings'][number]; lines: Lines; t: T; l: Lang }) {
  const [f, setF] = useState(funding);
  const set = (patch: Partial<typeof f>) => {
    setF((x) => ({ ...x, ...patch }));
    lines.change('fundings', funding.id, patch);
  };
  return (
    <div className="rowcard card-pad stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8 }}>
        <select className="input" style={{ flex: 1 }} aria-label={t('sheet.fundingNature')} value={f.nature} onChange={(e) => set({ nature: e.target.value })}>
          <option value="">{t('sheet.fundingNature')}…</option>
          {FUNDING_NATURES.map((c) => (
            <option key={c.key} value={c.key}>{c[l]}</option>
          ))}
        </select>
        <input className="input" type="date" style={{ width: 160, flex: 'none' }} aria-label={t('sheet.fundingDate')} value={f.onDate} onChange={(e) => set({ onDate: e.target.value })} />
        <Remove t={t} onRemove={() => lines.drop('fundings', funding.id)} />
      </div>
      <div className="row" style={{ gap: 8 }}>
        <NumberBox label={t('sheet.fundingAmount')} value={f.amount} onChange={(v) => set({ amount: v })} />
        <Currency value={f.currency} onChange={(v) => set({ currency: v })} />
        <input
          className="input"
          style={{ flex: 2, minWidth: 0 }}
          placeholder={t('sheet.funder')}
          aria-label={t('sheet.funder')}
          value={f.funderName}
          onChange={(e) => set({ funderName: e.target.value })}
        />
      </div>
    </div>
  );
}

function ProgramCard({ program, lines, t, l }: { program: DirectoryRecord['programs'][number]; lines: Lines; t: T; l: Lang }) {
  const [g, setG] = useState(program);
  const set = (patch: Partial<typeof g>) => {
    setG((x) => ({ ...x, ...patch }));
    lines.change('programs', program.id, patch);
  };
  return (
    <div className="rowcard card-pad stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8 }}>
        <input
          className="input"
          style={{ flex: 1, fontWeight: 600 }}
          aria-label={t('sheet.programName')}
          value={g.name}
          onChange={(e) => {
            setG((x) => ({ ...x, name: e.target.value }));
            if (e.target.value.trim()) lines.change('programs', program.id, { name: e.target.value });
          }}
        />
        <Remove t={t} onRemove={() => lines.drop('programs', program.id)} />
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <input className="input" style={{ flex: 2, minWidth: 140 }} placeholder={t('sheet.programOrg')} aria-label={t('sheet.programOrg')} value={g.organisation} onChange={(e) => set({ organisation: e.target.value })} />
        <input className="input" type="date" style={{ flex: 1, minWidth: 130 }} aria-label={t('sheet.programStart')} value={g.startsOn} onChange={(e) => set({ startsOn: e.target.value })} />
        <input className="input" type="date" style={{ flex: 1, minWidth: 130 }} aria-label={t('sheet.programEnd')} value={g.endsOn} onChange={(e) => set({ endsOn: e.target.value })} />
        <select className="input" style={{ flex: 1, minWidth: 120 }} aria-label={t('sheet.programStatus')} value={g.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">{t('sheet.programStatus')}…</option>
          {PROGRAM_STATUSES.map((c) => (
            <option key={c.key} value={c.key}>{c[l]}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Une ligne de plus : un nom, Entrée, et elle existe. Le reste se remplit dans sa carte. */
function NewLine({ label, placeholder, t, onAdd }: { label: string; placeholder: string; t: T; onAdd: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);
  const add = async () => {
    if (!name.trim()) return;
    await onAdd(name.trim());
    setName('');
    setOpen(false);
  };
  if (!open) {
    return (
      <button className="btn sm" style={{ alignSelf: 'flex-start', marginTop: 8 }} onClick={() => setOpen(true)}>
        <Icon name="plus" size={13} /> {label}
      </button>
    );
  }
  return (
    <div className="row" style={{ gap: 6, marginTop: 8 }}>
      <input
        className="input"
        autoFocus
        value={name}
        placeholder={placeholder}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void add()}
      />
      <button className="btn ghost sm" onClick={() => setOpen(false)}>{t('sheet.cancel')}</button>
      <button className="btn primary sm" disabled={!name.trim()} onClick={() => void add()}>{t('sheet.add')}</button>
    </div>
  );
}

/** Retirer, en deux temps : une ligne effacée ne revient pas. */
function Remove({ t, onRemove }: { t: T; onRemove: () => void }) {
  const [sure, setSure] = useState(false);
  if (!sure) {
    return (
      <button className="btn ghost icon sm" aria-label={t('sheet.remove')} title={t('sheet.remove')} onClick={() => setSure(true)}>
        <Icon name="trash" size={13} />
      </button>
    );
  }
  return (
    <span className="row" style={{ gap: 4 }}>
      <span className="faint" style={{ fontSize: 12 }}>{t('sheet.removeSure')}</span>
      <button className="btn danger sm" onClick={onRemove}>{t('sheet.remove')}</button>
      <button className="btn ghost sm" onClick={() => setSure(false)}>{t('sheet.cancel')}</button>
    </span>
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
