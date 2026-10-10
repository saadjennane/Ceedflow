/**
 * La fiche d'une startup, des deux côtés du miroir.
 *
 * The same three pieces serve the founder filling it in, the staff chasing it
 * and the juror reading it, because they must agree: a bar that says 80 % while
 * the jury's pane shows a blank sector is worse than no bar at all.
 *
 *   ProfileBar    — how far along, and what is still missing, by name
 *   ProfileFacts  — the fiche as it is read
 *   ProfileFields — the fiche as it is filled in
 *
 * The words come from the member space's dictionary, so the founder reads it in
 * French and the workspace in English without two copies of the labels.
 */
import {
  MAX_UPLOAD_BYTES,
  ORG_STAGES,
  profileDone,
  profileMissing,
  type OrgProfile,
  type ProfileAsk,
} from '@ceed/shared';
import { useState } from 'react';
import { say, useLang, type Lang } from '../lib/lang';
import { Icon } from './Icon';

export const ASK_WORD: Record<ProfileAsk, Parameters<typeof say>[0]> = {
  logo: 'prof.ask.logo',
  pitch: 'prof.ask.pitch',
  sector: 'prof.ask.sector',
  stage: 'prof.ask.stage',
  founded: 'prof.ask.founded',
  team: 'prof.ask.team',
  city: 'prof.ask.city',
  website: 'prof.ask.website',
  linkedin: 'prof.ask.linkedin',
  bio: 'prof.ask.bio',
};

const STAGE_WORD = {
  idea: 'stage.idea', prototype: 'stage.prototype', mvp: 'stage.mvp',
  customers: 'stage.customers', growing: 'stage.growing',
} as const;

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
          {missing.map((ask) => t(ASK_WORD[ask])).join(', ')}
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

/** One fact, written as a value rather than an empty box. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div style={{ fontSize: 13 }}>{value || <span className="faint">—</span>}</div>
    </div>
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
 * relancer. Only what is there: a screen of dashes reads as a reproach.
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
  const t = (w: Parameters<typeof say>[0]) => say(w, l);
  const stage = ORG_STAGES.find((s) => s === profile.stage);

  return (
    <div className="stack" style={{ gap: 12 }}>
      {lead && (profile.logoUploadId || profile.pitch) && (
        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <Logo uploadId={profile.logoUploadId} name={name} size={52} />
          {profile.pitch && (
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, fontWeight: 600, flex: 1 }}>{profile.pitch}</p>
          )}
        </div>
      )}

      <div className="prof-facts">
        <Fact label={t('prof.sector')} value={profile.sector} />
        <Fact label={t('prof.stage')} value={stage ? t(STAGE_WORD[stage]) : profile.stage} />
        <Fact label={t('prof.founded')} value={profile.foundedYear === null ? '' : String(profile.foundedYear)} />
        <Fact
          label={t('prof.team')}
          value={profile.teamSize === null ? '' : `${profile.teamSize} ${t('prof.people')}`}
        />
        {/* Le pays seul ne dit pas où : « Morocco » s'affichait comme une
            réponse alors que la barre comptait la ville comme manquante, et les
            deux ne pouvaient pas avoir raison en même temps. */}
        <Fact
          label={t('prof.city')}
          value={profile.city ? [profile.city, profile.country].filter(Boolean).join(', ') : ''}
        />
        {/* Cliquable : un juré qui veut voir le site le veut maintenant. */}
        <div>
          <div className="eyebrow">{t('prof.website')}</div>
          <div style={{ fontSize: 13 }}>
            {profile.website ? (
              <a href={profile.website} target="_blank" rel="noreferrer">{profile.website}</a>
            ) : (
              <span className="faint">—</span>
            )}
          </div>
        </div>
      </div>

      {profile.linkedin && (
        <a className="btn ghost sm" href={profile.linkedin} target="_blank" rel="noreferrer"
           style={{ alignSelf: 'flex-start' }}>
          <Icon name="link" size={13} /> {t('prof.linkedin')}
        </a>
      )}

      {profile.bio && (
        <div>
          <div className="eyebrow">{t('prof.bio')}</div>
          <p style={{ margin: '3px 0 0', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{profile.bio}</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Filling it in                                                       */
/* ------------------------------------------------------------------ */

/** What the editor hands back — the same names the record uses. */
export type ProfileDraft = Pick<
  OrgProfile,
  'logoUploadId' | 'pitch' | 'sector' | 'stage' | 'foundedYear' | 'teamSize' | 'linkedin'
>;

/**
 * Un entier ou rien.
 *
 * An empty box is not a zero: a founder who clears the year meant "I do not
 * know", and `Number('')` is 0, which would put the company's founding in the
 * year nought and count the ask as answered.
 */
const whole = (text: string): number | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.round(n) : null;
};

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

export function ProfileFields({
  draft,
  set,
  name,
  lang,
}: {
  draft: ProfileDraft;
  set: (partial: Partial<ProfileDraft>) => void;
  name: string;
  lang?: Lang;
}) {
  const context = useLang();
  const l = voice(lang, context.lang);
  const t = (w: Parameters<typeof say>[0]) => say(w, l);
  return (
    <>
      <RecordImage
        label={t('prof.logo')}
        uploadId={draft.logoUploadId}
        name={name}
        onChange={(v) => set({ logoUploadId: v })}
      />

      <div className="field">
        <label>{t('prof.pitch')}</label>
        <div className="help">{t('prof.pitchHelp')}</div>
        <input
          className="input"
          value={draft.pitch}
          maxLength={160}
          onChange={(e) => set({ pitch: e.target.value })}
        />
      </div>

      <div className="grid-2">
        <div className="field">
          <label>{t('prof.sector')}</label>
          <input className="input" value={draft.sector} onChange={(e) => set({ sector: e.target.value })} />
        </div>
        <div className="field">
          <label>{t('prof.founded')}</label>
          <input
            className="input"
            type="number"
            value={draft.foundedYear === null ? '' : draft.foundedYear}
            onChange={(e) => set({ foundedYear: whole(e.target.value) })}
          />
        </div>
      </div>

      <div className="field">
        <label>{t('prof.stage')}</label>
        <div className="work-pick">
          {ORG_STAGES.map((s) => (
            <button
              key={s}
              type="button"
              className={draft.stage === s ? 'track on' : 'track'}
              /* Re-cliquer défait : c'est la seule façon de revenir à « je ne
                 sais pas encore » sans un bouton « aucun » de plus. */
              onClick={() => set({ stage: draft.stage === s ? '' : s })}
            >
              {t(STAGE_WORD[s])}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div className="field">
          <label>{t('prof.team')}</label>
          <input
            className="input"
            type="number"
            value={draft.teamSize === null ? '' : draft.teamSize}
            onChange={(e) => set({ teamSize: whole(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>{t('prof.linkedin')}</label>
          <input
            className="input"
            value={draft.linkedin}
            placeholder="https://www.linkedin.com/company/…"
            onChange={(e) => set({ linkedin: e.target.value })}
          />
        </div>
      </div>
    </>
  );
}
