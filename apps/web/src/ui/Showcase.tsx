/**
 * Ce qui donne du relief à une fiche : son en-tête, ce qu'elle fait en mots,
 * comment la joindre, et où elle en est.
 *
 * The same pieces for an organisation and a person, seen by CEED or by the
 * member: a hero with a band in the record's colour, the activity — and its
 * problem and solution — each in a block of its own so the texts never blur
 * into one another, the facts beyond the figures, and the coordinates with a
 * way to copy them.
 */
import {
  ACTIVITY_NATURES,
  LEGAL_FORMS,
  PATENT_ANSWERS,
  PRODUCT_STATUSES,
  SALES_ZONES,
  TARGET_MARKETS,
  type Choice,
  type OrgProfile,
  type Place,
} from '@ceed/shared';
import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { useBrandColour } from './brandColour';

type Lang = 'fr' | 'en';
const said = (list: readonly Choice[], key: string, lang: Lang) => {
  const c = list.find((x) => x.key === key);
  return c ? c[lang] : '';
};

/** Une couleur stable pour un nom : le bandeau et la pastille d'une fiche sans logo. */
export function colourOf(name: string): string {
  const palette = ['#2f5bff', '#0f9d74', '#7a5cff', '#e0782a', '#d8305a', '#00a0c8', '#c77400'];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length]!;
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** L'en-tête : un bandeau, un logo ou une photo qui le chevauche, le nom et ce qui va avec. */
export function Hero({
  name,
  colour,
  imageId,
  brandColour,
  round = false,
  eyebrow,
  subtitle,
  pitch,
  chips,
  side,
}: {
  name: string;
  colour?: string;
  imageId?: string | null;
  /** Sa couleur choisie ; sans, celle du logo (pas d'une photo). */
  brandColour?: string | null;
  round?: boolean;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  pitch?: ReactNode;
  chips?: ReactNode;
  side?: ReactNode;
}) {
  const brand = useBrandColour({ name, brandColour, logoUploadId: round ? null : imageId });
  const c = colour ?? brand;
  return (
    <section className="sc-hero">
      <div className="sc-band" style={{ background: `linear-gradient(115deg, ${c}, var(--cyan))` }} />
      <div className="sc-hero-body">
        <div className={round ? 'sc-mark round' : 'sc-mark'} style={{ background: imageId ? 'var(--surface)' : c }}>
          {imageId ? <img src={`/api/uploads/${imageId}`} alt="" /> : initialsOf(name)}
        </div>
        <div className="sc-hero-text">
          {eyebrow && <div className="row wrap" style={{ gap: 6, marginBottom: 4 }}>{eyebrow}</div>}
          <h2>{name}</h2>
          {subtitle && <p className="sc-sub">{subtitle}</p>}
          {pitch && <p className="sc-pitch">{pitch}</p>}
          {chips && <div className="row wrap" style={{ gap: 6 }}>{chips}</div>}
        </div>
        {side && <div className="sc-hero-side">{side}</div>}
      </div>
    </section>
  );
}

/** Un anneau qui se remplit : la complétude d'une fiche, ou sa santé. */
export function Ring({ value, label, tone = 'ok' }: { value: number; label: string; tone?: 'ok' | 'blue' | 'warn' }) {
  const colour = tone === 'blue' ? 'var(--blue)' : tone === 'warn' ? 'var(--warn)' : 'var(--ok)';
  return (
    <div className="sc-ring" style={{ background: `conic-gradient(${colour} ${value}%, var(--wash) 0)` }} aria-label={`${label} ${value} %`}>
      <span>
        <b className="num">{value}%</b>
        <small>{label}</small>
      </span>
    </div>
  );
}

/** Un texte dans son bloc : un intitulé coloré, un fond à peine teinté. */
function Block({ label, tone, children }: { label: string; tone?: 'problem' | 'solution'; children: ReactNode }) {
  return (
    <div className={`sc-txt${tone === 'problem' ? ' pb' : tone === 'solution' ? ' sol' : ''}`}>
      <span className="sc-lbl">{label}</span>
      <p>{children}</p>
    </div>
  );
}

/** Ce que fait une organisation, en mots — au-delà des chiffres. */
export function OrgContent({ profile: p, lang, empty }: { profile: OrgProfile; lang: Lang; empty?: ReactNode }) {
  const fr = lang === 'fr';
  const activity = p.bio || p.pitch;
  const markets = p.targetMarkets.map((k) => said(TARGET_MARKETS, k, lang)).filter(Boolean).join(', ');
  const nature = said(ACTIVITY_NATURES, p.activityNature, lang);
  const zone = [said(SALES_ZONES, p.salesZone, lang), p.salesCountries.join(', ')].filter(Boolean).join(' · ');
  const founded = p.foundedOn ? p.foundedOn.slice(0, 4) : p.foundedYear ? String(p.foundedYear) : '';
  const legal = [
    said(LEGAL_FORMS, p.legalForm, lang),
    p.capitalAmount !== null ? `${fr ? 'capital' : 'capital'} ${p.capitalAmount.toLocaleString('fr-FR')} ${p.capitalCurrency}` : '',
    founded ? `${fr ? 'créée en' : 'founded'} ${founded}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const ids = [p.ice ? `ICE ${p.ice}` : '', p.rcNumber ? `RC ${p.rcNumber}` : ''].filter(Boolean).join(' · ');
  const patent = p.patent ? said(PATENT_ANSWERS, p.patent, lang) : '';
  const facts: [string, string][] = (
    [
      [fr ? 'Marché cible' : 'Target market', markets],
      [fr ? 'Clients' : 'Customers', [nature, p.activeClients !== null ? `${p.activeClients} ${fr ? 'actifs' : 'active'}` : ''].filter(Boolean).join(' · ')],
      [fr ? 'Ventes' : 'Sales', zone],
      [fr ? 'Forme juridique' : 'Legal form', legal],
      [fr ? 'Identifiants' : 'Identifiers', ids],
      [fr ? 'Propriété intellectuelle' : 'Intellectual property', patent],
    ] as [string, string][]
  ).filter(([, v]) => v);
  const nothing = !activity && !p.problem && !p.solution && !p.products.length && !p.mainOffering && !facts.length;

  return (
    <section className="card card-pad stack sc-content" style={{ gap: 12 }}>
      {nothing && (empty ?? <p className="faint" style={{ margin: 0, fontSize: 13 }}>{fr ? 'Rien n’est encore décrit.' : 'Nothing described yet.'}</p>)}
      {activity && <Block label={fr ? 'Activité' : 'Activity'}>{activity}</Block>}
      {(p.problem || p.solution) && (
        <div className="sc-split">
          {p.problem && <Block label={fr ? 'Problème' : 'Problem'} tone="problem">{p.problem}</Block>}
          {p.solution && <Block label={fr ? 'Solution' : 'Solution'} tone="solution">{p.solution}</Block>}
        </div>
      )}
      {(p.products.length > 0 || p.mainOffering) && (
        <div>
          <span className="sc-lbl plain">{fr ? 'Produits et services' : 'Products and services'}</span>
          {p.products.length > 0 ? (
            <div className="row wrap" style={{ gap: 6 }}>
              {p.products.map((x) => (
                <span key={x.id} className={x.status === 'available' || x.status === 'commercialised' ? 'badge info' : 'badge'}>
                  {x.name}
                  {x.status ? ` · ${said(PRODUCT_STATUSES, x.status, lang).toLowerCase()}` : ''}
                </span>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0 }}>{p.mainOffering}</p>
          )}
        </div>
      )}
      {facts.length > 0 && (
        <dl className="sc-facts">
          {facts.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{k}</dt>
              <dd className={k === 'Identifiants' || k === 'Identifiers' ? 'num' : undefined}>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/** Ce qu'une personne dit d'elle, et ce qu'on sait de son métier. */
export function PersonContent({
  bio,
  facts,
  lang,
}: {
  bio: string;
  facts: [string, string][];
  lang: Lang;
}) {
  const shown = facts.filter(([, v]) => v);
  return (
    <section className="card card-pad stack sc-content" style={{ gap: 12 }}>
      {bio ? (
        <Block label={lang === 'fr' ? 'À propos' : 'About'}>{bio}</Block>
      ) : (
        <p className="faint" style={{ margin: 0, fontSize: 13 }}>{lang === 'fr' ? 'Pas encore de présentation.' : 'No introduction yet.'}</p>
      )}
      {shown.length > 0 && (
        <dl className="sc-facts">
          {shown.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function CopyButton({ text, lang }: { text: string; lang: Lang }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="sc-copy"
      onClick={() => {
        const ok = () => {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        };
        navigator.clipboard?.writeText(text).then(ok, ok);
      }}
    >
      {done ? (lang === 'fr' ? 'Copié' : 'Copied') : lang === 'fr' ? 'Copier' : 'Copy'}
    </button>
  );
}

/** Comment joindre : téléphones, emails, adresse, site et réseaux — chacun avec son icône. */
export function Coordinates({
  emails,
  phones,
  places = [],
  website,
  linkedin,
  socials = [],
  lang,
  copy = false,
}: {
  emails: string[];
  phones: string[];
  places?: Place[];
  website?: string;
  linkedin?: string;
  socials?: string[];
  lang: Lang;
  copy?: boolean;
}) {
  const fr = lang === 'fr';
  const href = (u: string) => (/^https?:\/\//.test(u) ? u : `https://${u}`);
  const rows: { icon: string; value: ReactNode; text?: string; note: string }[] = [
    ...phones.map((n, i) => ({ icon: 'phone', value: <span className="num">{n}</span>, text: n, note: i === 0 ? (fr ? 'Téléphone' : 'Phone') : '' })),
    ...emails.map((e, i) => ({ icon: 'mail', value: e, text: e, note: i === 0 ? 'Email' : '' })),
    ...places
      .filter((pl) => pl.city || pl.country || pl.address)
      .map((pl, i) => ({
        icon: 'pin',
        value: [pl.address, pl.city, pl.country].filter(Boolean).join(', '),
        note: i === 0 ? (fr ? 'Adresse' : 'Address') : '',
      })),
    ...(website ? [{ icon: 'link', value: <a href={href(website)} target="_blank" rel="noreferrer">{website}</a>, note: fr ? 'Site' : 'Website' }] : []),
    ...(linkedin ? [{ icon: 'link', value: <a href={href(linkedin)} target="_blank" rel="noreferrer">LinkedIn</a>, note: '' }] : []),
    ...socials.map((s) => ({ icon: 'link', value: <a href={href(s)} target="_blank" rel="noreferrer">{s.replace(/^https?:\/\/(www\.)?/, '')}</a>, note: '' })),
  ];
  return (
    <section className="card card-pad stack" style={{ gap: 0 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>{fr ? 'Coordonnées' : 'Contact'}</div>
      {!rows.length && <p className="faint" style={{ margin: 0, fontSize: 13 }}>{fr ? 'Aucune coordonnée.' : 'No contact details.'}</p>}
      {rows.map((r, i) => (
        <div key={i} className="sc-coord">
          <span className="sc-ci">
            <Icon name={r.icon} size={14} />
          </span>
          <span className="sc-v">
            {r.value}
            {r.note && <small>{r.note}</small>}
          </span>
          {copy && r.text && <CopyButton text={r.text} lang={lang} />}
        </div>
      ))}
    </section>
  );
}
