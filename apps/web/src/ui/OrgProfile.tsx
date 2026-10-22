/**
 * La fiche d'une organisation, des deux côtés du miroir.
 *
 * The same pieces serve the founder filling it in, the staff chasing it and
 * the juror reading it, because they must agree: a bar that says 80 % while
 * the jury's pane shows a blank sector is worse than no bar at all.
 *
 *   ProfileBar    — how far along, and what is still missing, by name
 *   ProfileFacts  — the fiche as it is read: only what is there
 *   OrgSheet      — the fiche as it is filled in (OrgSheet.tsx)
 *
 * The words come from the member space's dictionary, so the founder reads it in
 * French and the workspace in English without two copies of the labels.
 */
import {
  LEGAL_FORMS,
  LEGAL_STATUSES,
  MATURITY_LEVELS,
  MAX_UPLOAD_BYTES,
  ORG_TYPES,
  SECTORS,
  choiceLabel,
  profileDone,
  profileMissing,
  type OrgProfile,
  type ProfileAsk,
} from '@ceed/shared';
import { useState, type ReactNode } from 'react';
import { say, useLang, type Lang, type Word } from '../lib/lang';
import { Icon } from './Icon';

export const ASK_WORD = Object.fromEntries(
  (
    [
      'logo', 'pitch', 'orgType', 'legalStatus', 'founded', 'legalForm', 'capital', 'sector', 'website',
      'linkedin', 'email', 'phone', 'city', 'address', 'bio', 'team', 'maturity', 'mvpUsers', 'revenues',
      'clients', 'patent', 'patentDetails', 'contracts', 'contractsDetail',
    ] as const satisfies readonly ProfileAsk[]
  ).map((k) => [k, `prof.ask.${k}` as Word]),
) as Record<ProfileAsk, Word>;

/** A sum of money, the way a reader expects it in their language. */
export const money = (amount: number, currency: string, lang: Lang) =>
  `${new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits: 0 }).format(amount)} ${currency}`;

/** The language of this card: the one it is given, else the one around it. */
const voice = (given: Lang | undefined, context: Lang): Lang => given ?? context;

/**
 * Combien de remplie, et ce qui manque, nommé.
 *
 * A bare percentage tells somebody they are unfinished without telling them
 * what to do about it, which is the one thing a progress bar owes them. So the
 * missing asks are listed in words, and the whole strip is the button.
 */
export function ProfileBar({
  profile,
  onFill,
  lang,
}: {
  profile: OrgProfile;
  /** Given on a screen where the fiche can be opened; absent where it cannot. */
  onFill?: () => void;
  lang?: Lang;
}) {
  const context = useLang();
  const l = voice(lang, context.lang);
  const t = (w: Parameters<typeof say>[0]) => say(w, l);
  const done = profileDone(profile);
  const missing = profileMissing(profile);

  const body = (
    <>
      <div className="row" style={{ gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 }}>
          {missing.length === 0 ? t('prof.done') : `${t('prof.left')} ${missing.length}`}
        </span>
        <span className="num faint" style={{ fontSize: 12.5 }}>{done} %</span>
        {onFill && <Icon name="chevronRight" size={14} />}
      </div>
      <div className="prof-track" aria-hidden>
        <span className={done === 100 ? 'prof-fill full' : 'prof-fill'} style={{ width: `${done}%` }} />
      </div>
      {missing.length > 0 && (
        /* Nommé, pas compté : « il reste 4 » n'envoie personne nulle part. */
        <p className="faint" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>
          {/* Les cinq premiers : la fiche en demande vingt, et une ligne qui les
              énumère tous se lit comme un reproche plutôt que comme une piste. */}
          {missing.slice(0, 5).map((ask) => t(ASK_WORD[ask])).join(', ')}
          {missing.length > 5 ? '…' : ''}
        </p>
      )}
    </>
  );

  if (!onFill) return <div className="prof-bar stack">{body}</div>;
  return (
    <button className="prof-bar stack as-row" onClick={onFill} style={{ width: '100%', textAlign: 'left' }}>
      {body}
    </button>
  );
}

/** The logo, at whatever size the place wants it. */
export function Logo({ uploadId, name, size = 44 }: { uploadId: string | null; name: string; size?: number }) {
  if (!uploadId) return null;
  return (
    <img
      className="prof-logo"
      src={`/api/uploads/${uploadId}`}
      alt={name}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * La fiche telle qu'on la lit — un juré avant de rencontrer, CEED avant de
 * relancer, la startup qui se relit.
 *
 * Only what is there. No dashes, no "not given": a section with nothing in it
 * does not appear, and a company that filled three sections has a page of
 * three sections that reads as whole. What is missing is said elsewhere, to
 * the people who can do something about it — never to a reader.
 */
export function ProfileFacts({
  profile,
  name,
  lang,
  lead = true,
}: {
  profile: OrgProfile;
  name: string;
  lang?: Lang;
  /** False where the logo and the sentence are already above, on the page's own head. */
  lead?: boolean;
}) {
  const context = useLang();
  const l = voice(lang, context.lang);
  const t = (w: Word) => say(w, l);
  const p = profile;

  const founded = p.foundedOn
    ? `${t('view.founded')} ${new Date(`${p.foundedOn}T12:00:00`).toLocaleDateString(l === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : p.foundedYear !== null
      ? `${t('view.foundedIn')} ${p.foundedYear}`
      : '';
  const hq = p.places[0];
  const badges = [
    p.orgType && choiceLabel(ORG_TYPES, p.orgType, l),
    p.maturity && choiceLabel(MATURITY_LEVELS, p.maturity, l),
    p.sector && choiceLabel(SECTORS, p.sector, l),
    ...p.secondarySectors.map((k) => choiceLabel(SECTORS, k, l)),
    hq?.city && [hq.city, hq.country].filter(Boolean).join(', '),
    founded,
  ].filter(Boolean) as string[];

  /* Les exercices renseignés, du plus récent au plus ancien ; le dernier qui
     a un montant fait la tuile, avec son évolution quand le précédent existe. */
  const years = [...p.revenues].sort((a, b) => b.year - a.year);
  const priced = years.filter((r) => !r.unavailable && r.amount !== null);
  const last = priced[0];
  const before = last ? priced.find((r) => r.year === last.year - 1) : undefined;
  const trend =
    last && before && before.amount ? Math.round(((last.amount! - before.amount) / before.amount) * 100) : null;

  const tiles: { label: string; value: string; hint?: string }[] = [];
  if (last) {
    tiles.push({
      label: `${t('view.turnover')} ${last.year}`,
      value: money(last.amount!, last.currency, l),
      hint: trend === null ? undefined : `${trend > 0 ? '+' : ''}${trend} % / ${before!.year}`,
    });
  }
  if (p.teamSize !== null) tiles.push({ label: t('view.team'), value: String(p.teamSize) });
  if (p.activeClients !== null) tiles.push({ label: t('view.clients'), value: String(p.activeClients) });
  if (p.signedContracts === 'yes' && p.contractsAmount !== null) {
    tiles.push({
      label: t('view.contracts'),
      value: money(p.contractsAmount, p.capitalCurrency || 'MAD', l),
      hint: p.contractsCount !== null ? `${p.contractsCount}` : undefined,
    });
  }

  const legal = [
    p.legalStatus && choiceLabel(LEGAL_STATUSES, p.legalStatus, l),
    p.legalStatus === 'registered' && p.legalForm && choiceLabel(LEGAL_FORMS, p.legalForm, l),
    p.legalStatus === 'registered' && p.capitalAmount !== null &&
      `${t('view.capital')} ${money(p.capitalAmount, p.capitalCurrency, l)}`,
  ].filter(Boolean) as string[];

  const patent =
    p.patent === 'yes'
      ? [t('view.patentGranted'), p.patentDetails.number, p.patentDetails.country, p.patentDetails.office, p.patentDetails.date]
          .filter(Boolean)
          .join(' · ')
      : p.patent === 'pending'
        ? [t('view.patentPending'), p.patentDetails.procedure].filter(Boolean).join(' · ')
        : '';
  const performance = [
    p.maturity === 'mvp' && p.mvpUsers === 'yes' && t('view.users'),
    p.maturity === 'mvp' && p.mvpUsers === 'no' && t('view.noUsers'),
    patent,
  ].filter(Boolean) as string[];

  const links = [
    p.website && { href: p.website, label: p.website.replace(/^https?:\/\//, '') },
    p.linkedin && { href: p.linkedin, label: 'LinkedIn' },
    ...p.socials.map((s) => ({ href: s, label: s.replace(/^https?:\/\/(www\.)?/, '') })),
  ].filter(Boolean) as { href: string; label: string }[];
  const reach = [...p.emails, ...p.phones, hq?.address].filter(Boolean) as string[];
  const elsewhere = p.places.slice(1).map((x) => [x.city, x.country].filter(Boolean).join(', ')).filter(Boolean);

  return (
    <div className="stack" style={{ gap: 16 }}>
      {lead && (p.logoUploadId || p.pitch) && (
        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <Logo uploadId={p.logoUploadId} name={name} size={52} />
          {p.pitch && (
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, fontWeight: 600, flex: 1 }}>{p.pitch}</p>
          )}
        </div>
      )}

      {badges.length > 0 && (
        <div className="row wrap" style={{ gap: 6 }}>
          {badges.map((b) => (
            <span className="badge" key={b}>{b}</span>
          ))}
        </div>
      )}

      {tiles.length > 0 && (
        <div className="view-tiles">
          {tiles.map((tile) => (
            <div className="view-tile" key={tile.label}>
              <div className="eyebrow">{tile.label}</div>
              <div className="view-tile-value num">{tile.value}</div>
              {tile.hint && <div className="faint num" style={{ fontSize: 12 }}>{tile.hint}</div>}
            </div>
          ))}
        </div>
      )}

      {p.bio && (
        <Block title={t('view.about')}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{p.bio}</p>
        </Block>
      )}

      {(performance.length > 0 || years.length > 1) && (
        <Block title={t('view.performance')}>
          {performance.map((line) => (
            <div key={line} style={{ fontSize: 13 }}>{line}</div>
          ))}
          {years.length > 1 && (
            <table className="view-years">
              <caption className="eyebrow">{t('view.byYear')}</caption>
              <tbody>
                {years.map((r) => (
                  <tr key={r.year}>
                    <th className="num">{r.year}</th>
                    <td className="num">{r.unavailable || r.amount === null ? <span className="faint">{t('view.na')}</span> : money(r.amount, r.currency, l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Block>
      )}

      {legal.length > 0 && (
        <Block title={t('view.legal')}>
          <div style={{ fontSize: 13 }}>{legal.join(' · ')}</div>
        </Block>
      )}

      {(links.length > 0 || reach.length > 0 || elsewhere.length > 0) && (
        <Block title={t('view.contact')}>
          {links.length > 0 && (
            <div className="row wrap" style={{ gap: 6 }}>
              {/* Cliquables : un juré qui veut voir le site le veut maintenant. */}
              {links.map((link) => (
                <a className="btn ghost sm" key={link.href} href={link.href} target="_blank" rel="noreferrer">
                  <Icon name="link" size={13} /> {link.label}
                </a>
              ))}
            </div>
          )}
          {reach.length > 0 && <div className="faint" style={{ fontSize: 12.5 }}>{reach.join(' · ')}</div>}
          {elsewhere.length > 0 && (
            <div style={{ fontSize: 12.5 }}>
              <span className="faint">{t('view.places')} · </span>
              {elsewhere.join(' · ')}
            </div>
          )}
        </Block>
      )}
    </div>
  );
}

/** Un bloc de la fiche lue : un titre, et ce qu'il y a dessous. */
function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="stack" style={{ gap: 6 }}>
      <div className="eyebrow">{title}</div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Filling it in                                                       */
/* ------------------------------------------------------------------ */

/**
 * L'image d'une fiche : un logo pour une société, une photo pour quelqu'un.
 *
 * Le même champ et la même colonne — ce qui change est le mot, et ce que la
 * liste en fait. Sortie du formulaire de la fiche startup pour que l'annuaire
 * s'en serve aussi, plutôt que d'en écrire une seconde qui dériverait.
 */
export function RecordImage({
  label,
  uploadId,
  name,
  onChange,
}: {
  label: string;
  uploadId: string | null;
  name: string;
  onChange: (next: string | null) => void;
}) {
  const { lang } = useLang();
  const t = (w: Parameters<typeof say>[0]) => say(w, lang);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const put = async (file: File) => {
    setProblem('');
    if (file.size > MAX_UPLOAD_BYTES) {
      setProblem(`${(file.size / 1024 / 1024).toFixed(1)} MB — 10 MB max.`);
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('fieldId', 'logo');
      body.append('file', file);
      const res = await fetch('/api/public/uploads', { method: 'POST', body });
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Upload failed.');
      const saved = (await res.json()) as { id: string };
      onChange(saved.id);
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field">
      <label>{label}</label>
      {uploadId ? (
        <div className="row" style={{ gap: 10 }}>
          <Logo uploadId={uploadId} name={name} size={44} />
          <button className="btn ghost sm" onClick={() => onChange(null)}>{t('file.replace')}</button>
        </div>
      ) : (
        <label className="dropzone">
          <input type="file" accept="image/*" disabled={busy} onChange={(e) => e.target.files?.[0] && put(e.target.files[0])} />
          <Icon name="file" size={16} />
          <span>{busy ? t('file.sending') : t('file.choose')}</span>
        </label>
      )}
      {problem && <div style={{ color: 'var(--stop)', fontSize: 12 }}>{problem}</div>}
    </div>
  );
}
