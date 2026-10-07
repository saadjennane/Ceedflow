import {
  ORG_ROLES,
  canEditOrg,
  profileOf,
  type AffiliationView,
  type Me,
  type OrgProfile,
} from '@ceed/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { useAccount } from '../../lib/account';
import { formatDate } from '../../lib/format';
import { useAsync, type AsyncState } from '../../lib/useAsync';
import { stillWaiting } from '../../lib/panels';
import type { ReviewPanel } from './ReviewPage';
import { Icon } from '../../ui/Icon';
import { Modal, useToast } from '../../ui/Overlays';
import '../../ui/builder.css';
import '../../ui/directory.css';
import { initials } from '../directory/DirectoryPage';
import { OwedItems, type Owed } from './OwedItems';
import { Agenda, type AgendaEntry } from './Agenda';
import { MemberHome, type CandidacyState } from './MemberHome';
import { LangProvider, useLang } from '../../lib/lang';
import { TeamModal } from './TeamPanel';
import { ProfileBar, ProfileFacts, ProfileFields, type ProfileDraft } from '../../ui/OrgProfile';

/**
 * The member space: your profile, and the organisation pages you look after.
 * The profile is your directory record — editing it here is editing the row the
 * whole product already points at.
 */
/** The four places a member has. Jury only exists for somebody on a panel. */
const MEMBER_TABS = ['Home', 'Programs', 'Jury', 'Profile', 'Settings'] as const;
/** The word each tab wears, in the language the member reads. */
const TAB_WORD = {
  Home: 'tab.home', Programs: 'tab.programs', Jury: 'tab.jury', Profile: 'tab.profile', Settings: 'tab.settings',
} as const;
type MemberTab = (typeof MEMBER_TABS)[number];

/**
 * Ce que CEED regarde quand il ouvre la page de quelqu'un d'autre.
 *
 * The same page, their data, and nothing that writes: the point is to read
 * what twenty-four founders will read before they read it, not to answer for
 * them.
 */
export interface MemberPreview {
  who: { name: string; email: string } | null;
  orgName: string;
  programs: MyProgram[];
  panels: ReviewPanel[];
  owed: Record<string, Owed[]>;
  agenda: Record<string, AgendaEntry[]>;
  /** La fiche de la startup, pour la lire comme elle la lit. */
  profile: OrgProfile | null;
}

export function MemberPage({ preview }: { preview?: MemberPreview } = {}) {
  /* Le français par défaut, l'anglais offert : c'est l'espace des fondateurs
     et des jurés, et l'espace CEED, lui, reste en anglais. */
  return (
    <LangProvider>
      <MemberSpace preview={preview} />
    </LangProvider>
  );
}

function MemberSpace({ preview }: { preview?: MemberPreview }) {
  const { me, loading, reload } = useAccount();
  const { lang, setLang, t } = useLang();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  /* Kept in the URL so coming back, refreshing or following a link lands where
     you were rather than at the top of the pile. */
  const panels = useAsync(
    async () => preview?.panels ?? api.get<ReviewPanel[]>('/api/me/reviews'),
    preview ? 'preview-panels' : 'reviews',
  );
  const programs = useAsync(
    async () => preview?.programs ?? api.get<MyProgram[]>('/api/me/programs'),
    preview ? 'preview-programs' : 'programs',
  );
  const isJuror = (panels.data?.length ?? 0) > 0;
  /* Settings holds a password and a way out of the account — neither means
     anything about somebody else's page. */
  const tabs = MEMBER_TABS.filter((t) => (t !== 'Jury' || isJuror) && (t !== 'Settings' || !preview));
  const asked = params.get('tab') as MemberTab | null;
  /* On ouvre là où il y a quelque chose à faire.
     Nobody signs in to read their own profile: a founder comes to see what is
     still asked of them, a juror to see what is left to mark. Profile is where
     you end up when neither is true. */
  const landing: MemberTab = (programs.data?.length ?? 0) > 0 ? 'Home' : isJuror ? 'Jury' : 'Profile';
  const tab: MemberTab = asked && tabs.includes(asked) ? asked : landing;
  const setTab = (next: MemberTab) =>
    setParams((p) => {
      const q = new URLSearchParams(p);
      q.set('tab', next);
      q.delete('prog');
      return q;
    });
  /* Quel programme on regarde, dans l'adresse comme l'onglet : revenir, ou
     recharger, doit ramener là où l'on était. */
  const openEdition = params.get('prog') ?? '';
  const setEdition = (editionId: string) =>
    setParams((p) => {
      const q = new URLSearchParams(p);
      q.set('tab', 'Programs');
      if (editionId) q.set('prog', editionId);
      else q.delete('prog');
      return q;
    });

  /* Ce que chaque candidature doit et ce qui l'attend, rassemblé une fois pour
     la page d'accueil comme pour celle d'un programme. */
  const mine = (programs.data ?? []).flatMap((p) => p.mine.map((c) => ({ ...c, programme: p })));
  const key = mine.map((c) => c.id).join(',');
  const states = useAsync<CandidacyState[]>(
    async () =>
      preview
        ? mine.map((c) => ({
            candidateId: c.id,
            orgName: c.orgName,
            programme: c.programme,
            owed: preview.owed[c.id] ?? [],
            agenda: preview.agenda[c.id] ?? [],
          }))
        : Promise.all(
            mine.map(async (c) => ({
              candidateId: c.id,
              orgName: c.orgName,
              programme: c.programme,
              owed: await api.get<Owed[]>(`/api/me/deliverables/${c.id}`),
              agenda: await api.get<AgendaEntry[]>(`/api/me/agenda/${c.id}`),
            })),
          ),
    `${key}:${preview ? 'preview' : 'mine'}`,
  );

  useEffect(() => {
    if (!preview && !loading && !me) navigate('/login', { replace: true });
  }, [preview, loading, me, navigate]);

  if (!preview) {
    if (loading) return <div className="member-shell" />;
    if (!me) return null;
  }
  // A password CEED chose is not yet this person's account. Nothing else opens
  // until they have replaced it — the server refuses it anyway.
  if (!preview && me!.account.mustChangePassword) {
    return (
      <ChoosePassword
        me={me!}
        // Having replaced it, somebody at CEED belongs in the workspace rather
        // than on their own profile page.
        onDone={() => (me!.account.staffRole ? navigate('/', { replace: true }) : reload())}
      />
    );
  }

  const name = preview ? (preview.who?.name ?? preview.orgName) : me!.record.name;
  const email = preview ? (preview.who?.email ?? '') : me!.account.email;

  return (
    <div className="member-shell">
      {preview && (
        <div className="callout" style={{ margin: '10px 14px 0' }}>
          <Icon name="eye" size={15} />
          <div>
            <strong>{preview.orgName} — read-only.</strong> This is their page, drawn by the same code they load.
            Nothing here writes to their file.
          </div>
        </div>
      )}

      <div className="member-bar">
        <span className="rec-mark">{initials(name)}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 13 }}>{name}</strong>
          <span className="faint" style={{ display: 'block', fontSize: 12 }}>
            {email}
          </span>
        </span>
        {/* Somebody at CEED has two places to be, and this page is the smaller
            one. Without this, the way back is a URL they have to know. */}
        {/* Deux langues, offertes depuis la page : CEED écrit en français à
            des fondateurs marocains, et un jury ne l'est pas toujours. */}
        <div className="seg" role="group" aria-label={t('bar.lang')}>
          <button className={lang === 'fr' ? 'on' : ''} onClick={() => setLang('fr')}>FR</button>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
        </div>
        {!preview && me!.account.staffRole && (
          <Link className="btn sm" to="/">
            <Icon name="grid" size={13} /> {t('bar.workspace')}
          </Link>
        )}
        {!preview && (
          <button
            className="btn sm"
            onClick={async () => {
              await api.post('/api/auth/logout');
              navigate('/login');
            }}
          >
            {t('bar.signOut')}
          </button>
        )}
      </div>

      <nav className="tabbar" role="tablist" aria-label={lang === 'fr' ? 'Votre espace' : 'Your space'}>
        {tabs.map((name) => (
          <button key={name} role="tab" className={name === tab ? 'tab on' : 'tab'} onClick={() => setTab(name)}>
            {t(TAB_WORD[name])}
          </button>
        ))}
      </nav>

      <div className="member-body stack" style={{ gap: 16 }}>
        {tab === 'Profile' && preview && (
          <>
            <section className="card card-pad stack" style={{ gap: 6 }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>{name}</h2>
              <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
                {[email, preview.who ? null : 'nobody is attached to this candidacy'].filter(Boolean).join(' · ')}
              </p>
            </section>
            {preview.profile && (
              <section className="card card-pad stack" style={{ gap: 12 }}>
                <div>
                  <h2 style={{ fontSize: 16, margin: 0 }}>{t('prof.title')}</h2>
                  <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>{t('prof.why')}</p>
                </div>
                <ProfileBar profile={preview.profile} />
                <ProfileFacts profile={preview.profile} name={preview.orgName} />
              </section>
            )}
          </>
        )}
        {tab === 'Profile' && !preview && (
          <>
            <Profile me={me!} onSaved={reload} />
            <Organisations me={me!} onChanged={reload} />
            <Involvement panels={panels.data ?? []} programs={programs.data ?? []} onGo={setTab} />
          </>
        )}
        {tab === 'Home' && (
          <MemberHome
            states={states.data ?? []}
            orgs={
              preview
                ? preview.profile
                  ? [{ name: preview.orgName, profile: preview.profile }]
                  : []
                : me!.organisations
                    .filter((l) => canEditOrg(l.affiliation.access))
                    .map((l) => ({ name: l.record.name, profile: profileOf(l.record) }))
            }
            onOpen={setEdition}
            onProfile={() => setTab('Profile')}
          />
        )}
        {tab === 'Programs' &&
          (openEdition ? (
            <ProgramPage
              state={(states.data ?? []).find((x) => x.programme.editionId === openEdition) ?? null}
              readOnly={Boolean(preview)}
              onBack={() => setEdition('')}
            />
          ) : (
            <Programs programs={programs} owedFor={preview?.owed} readOnly={Boolean(preview)} onOpen={setEdition} />
          ))}
        {tab === 'Jury' && <Jury panels={panels.data ?? []} />}
        {tab === 'Settings' && !preview && <Settings me={me!} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The one screen a provisional password reaches. It is not a warning that can
 * be dismissed: it is the whole member space until a password is chosen.
 */
function ChoosePassword({ me, onDone }: { me: Me; onDone: () => void }) {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const mismatch = confirm.length > 0 && confirm !== newPassword;
  const ready = currentPassword && newPassword.length >= 8 && confirm === newPassword;

  const submit = async () => {
    setBusy(true);
    setErrors({});
    try {
      await api.post('/api/me/password', { currentPassword, newPassword });
      toast('Password changed. Welcome.');
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else setErrors({ _: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="public">
      <div className="public-card" style={{ maxWidth: 460 }}>
        <div className="public-top" />
        <div className="public-body stack" style={{ gap: 14 }}>
          <h1>Choose your password</h1>
          <p className="public-intro">
            The password you signed in with was set by CEED, and we know it. Replace it with one only you
            know — nothing else opens until you do.
          </p>
          <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
            Signed in as <strong>{me.account.email}</strong>
          </p>

          {errors._ && (
            <div className="callout warn">
              <Icon name="alert" size={15} />
              <div>{errors._}</div>
            </div>
          )}

          <div className="field">
            <label>The password you were given</label>
            <input
              className={errors.currentPassword ? 'input bad' : 'input'}
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
            />
            {errors.currentPassword && (
              <div style={{ color: 'var(--stop)', fontSize: 12 }}>{errors.currentPassword}</div>
            )}
          </div>

          <div className="field">
            <label>Your new password</label>
            <input
              className={errors.newPassword ? 'input bad' : 'input'}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNext(e.target.value)}
            />
            {errors.newPassword ? (
              <div style={{ color: 'var(--stop)', fontSize: 12 }}>{errors.newPassword}</div>
            ) : (
              <div className="hint">At least 8 characters.</div>
            )}
          </div>

          <div className="field">
            <label>Type it once more</label>
            <input
              className={mismatch ? 'input bad' : 'input'}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ready && submit()}
            />
            {mismatch && <div style={{ color: 'var(--stop)', fontSize: 12 }}>The two do not match.</div>}
          </div>

          <button className="btn primary" disabled={busy || !ready} onClick={submit}>
            {busy ? 'One moment…' : 'Save my password'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The panels you sit on. Shown first when there are any: somebody who opens
 * this page during a selection round is here to review, not to edit an address.
 */
/**
 * The two things a member can do to their own account, and nothing else. The
 * email is what they sign in with, so changing it is CEED's to do — offering it
 * here would be offering a door that does not open.
 */
function Settings({ me }: { me: Me }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [typed, setTyped] = useState('');
  const navigate = useNavigate();
  const toast = useToast();

  const change = async () => {
    setErrors({});
    if (next !== confirm) {
      setErrors({ confirm: 'These two do not match.' });
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/me/password', { currentPassword: current, newPassword: next });
      setCurrent(''); setNext(''); setConfirm('');
      toast('Password changed.');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else toast((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="card card-pad stack" style={{ gap: 12 }}>
        <h2 style={{ fontSize: 16 }}>Password</h2>
        <Text label="Current password" type="password" value={current} error={errors.currentPassword} onChange={setCurrent} />
        <div className="grid-2">
          <Text label="New password" type="password" value={next} error={errors.newPassword} onChange={setNext} />
          <Text label="Again" type="password" value={confirm} error={errors.confirm} onChange={setConfirm} />
        </div>
        <button
          className="btn primary sm"
          style={{ alignSelf: 'flex-start' }}
          disabled={saving || !current || next.length < 8 || !confirm}
          onClick={change}
        >
          {saving ? 'Saving…' : 'Change password'}
        </button>
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          Eight characters at least. You stay signed in here; anywhere else you were signed in is signed out.
        </p>
      </section>

      <section className="card card-pad stack" style={{ gap: 12 }}>
        <h2 style={{ fontSize: 16 }}>Close your account</h2>
        {/* Said plainly, because what goes and what stays is the whole decision
            and nobody should have to guess it from the word "delete". */}
        <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
          Your way of signing in is removed, here and everywhere you are signed in. What you did stays with CEED:
          an application you sent, a panel you sat on, marks you gave. Those belong to the programme&apos;s record,
          not to your login. CEED can give you a new password later if you come back.
        </p>
        <button className="btn danger sm" style={{ alignSelf: 'flex-start' }} onClick={() => setClosing(true)}>
          <Icon name="trash" size={13} /> Close my account
        </button>
      </section>

      {closing && (
        <Modal
          title="Close your account?"
          subtitle={me.account.email}
          onClose={() => { setClosing(false); setTyped(''); }}
          footer={
            <>
              <button className="btn ghost" onClick={() => { setClosing(false); setTyped(''); }}>
                Cancel
              </button>
              <div className="spacer" />
              <button
                className="btn danger"
                disabled={typed.trim().toLowerCase() !== 'close'}
                onClick={async () => {
                  try {
                    await api.del('/api/me');
                    navigate('/login', { replace: true });
                  } catch (err) {
                    toast((err as Error).message, true);
                  }
                }}
              >
                Close my account
              </button>
            </>
          }
        >
          <p style={{ margin: '0 0 12px', fontSize: 13 }}>
            You will be signed out straight away and this password will stop working. Nothing you sent or wrote is
            deleted.
          </p>
          <Text label="Type close to confirm" value={typed} onChange={setTyped} placeholder="close" />
        </Modal>
      )}
    </>
  );
}

/** One published edition, as the server hands it to a member. */
/**
 * Un programme, du côté de la startup.
 *
 * Two tabs, because there are two kinds of thing: what is asked of them, and
 * what is coming. The wall will be the third, and it will not disturb either —
 * which is the reason for tabs rather than one long page.
 */
function ProgramPage({
  state,
  readOnly,
  onBack,
}: {
  state: CandidacyState | null;
  readOnly: boolean;
  onBack: () => void;
}) {
  const { t } = useLang();
  const [side, setSide] = useState<'todo' | 'agenda'>('todo');

  if (!state) return <div className="empty">{t('prog.none')}</div>;

  return (
    <div className="stack" style={{ gap: 14 }}>
      {/* Le nom et les onglets restent pendant qu'on descend la liste : sur dix
          pièces, savoir où l'on est ne doit pas demander de remonter. */}
      <div className="member-progbar stack" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 9 }}>
          <button className="btn ghost icon sm" onClick={onBack} aria-label={t('prog.back')}>
            <Icon name="chevronLeft" size={14} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ fontFamily: 'var(--display)', fontSize: 15.5 }}>
              {state.programme.programName}
            </strong>
            <span className="faint" style={{ display: 'block', fontSize: 12 }}>
              {[state.programme.editionName, state.orgName].filter(Boolean).join(' · ')}
            </span>
          </div>
        </div>

        <nav className="drawer-tabs" role="tablist">
          <button role="tab" className={side === 'todo' ? 'tab on' : 'tab'} onClick={() => setSide('todo')}>
            {t('prog.todo')}
          </button>
          <button role="tab" className={side === 'agenda' ? 'tab on' : 'tab'} onClick={() => setSide('agenda')}>
            {t('prog.agenda')}
            {state.agenda.length > 0 && (
              <span className="badge num" style={{ marginLeft: 6 }}>{state.agenda.length}</span>
            )}
          </button>
        </nav>
      </div>

      {side === 'todo' ? (
        state.owed.length ? (
          <OwedItems
            candidateId={state.candidateId}
            orgName={state.orgName}
            given={state.owed}
            readOnly={readOnly}
          />
        ) : (
          <section className="card card-pad">
            <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>{t('prog.noTodo')}</p>
          </section>
        )
      ) : (
        <Agenda entries={state.agenda} />
      )}
    </div>
  );
}

export interface MyProgram {
  programId: string;
  programName: string;
  editionId: string;
  editionName: string;
  editionStatus: 'Draft' | 'Live' | 'Completed';
  city: string;
  startsOn: string | null;
  endsOn: string | null;
  applications: 'not_configured' | 'scheduled' | 'live' | 'closed' | null;
  opensAt: string | null;
  applyUrl: string | null;
  mine: { id: string; orgName: string }[];
}

/**
 * What the programmes are doing, said in the one word that matters to somebody
 * outside CEED: can I apply. It is read from the Application brick itself —
 * closing the form is what closes applications, and nothing else says it.
 */
function applicationLine(p: MyProgram): { label: string; tone: string } {
  if (p.editionStatus === 'Completed') return { label: 'Completed', tone: 'badge' };
  if (p.applications === 'live') return { label: 'Applications open', tone: 'badge ok' };
  if (p.applications === 'scheduled')
    return { label: p.opensAt ? `Applications open ${formatDate(p.opensAt)}` : 'Applications not open yet', tone: 'badge warn' };
  if (p.applications === 'closed') return { label: 'Applications closed', tone: 'badge' };
  return { label: 'No form', tone: 'badge' };
}

export function Programs({
  programs,
  owedFor,
  readOnly = false,
  onOpen,
}: {
  programs: AsyncState<MyProgram[]>;
  /** Already fetched, when CEED is looking at somebody else's page. */
  owedFor?: Record<string, Owed[]>;
  readOnly?: boolean;
  /** Where a programme opens, when the list is a way in rather than the page. */
  onOpen?: (editionId: string) => void;
}) {
  const list = programs.data ?? [];
  const { t: says } = useLang();

  if (programs.error) return <div className="empty">{programs.error}</div>;
  if (!programs.data) return <div className="empty">Loading…</div>;
  if (!list.length) {
    return (
      <div className="empty">
        <h3>{says('prog.none')}</h3>
        <p>{says('prog.noneMore')}</p>
      </div>
    );
  }

  return (
    <div className="rows">
      {list.map((p) => {
        const state = applicationLine(p);
        return (
          <section className="card card-pad stack" key={p.editionId} style={{ gap: 10 }}>
            <div className="row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: 16, margin: 0 }}>{p.programName}</h2>
                <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
                  {[p.editionName, p.city, p.startsOn ? formatDate(p.startsOn) : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className={state.tone}>{state.label}</span>
            </div>

            {p.mine.map((c) => (
              <div className="rowcard link-row" key={c.id}>
                <Icon name="check" size={13} />
                <span style={{ flex: 1, fontSize: 13 }}>
                  <strong>{c.orgName}</strong> {says('prog.applied')}
                </span>
              </div>
            ))}

            {/* La liste est une entrée, pas la page : ce qu'on y demande se lit
                dans le programme, qui a de la place pour le dire. */}
            {onOpen && p.mine.length > 0 && (
              <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => onOpen(p.editionId)}>
                {says('home.open')} <Icon name="chevronRight" size={13} />
              </button>
            )}

            {!onOpen &&
              p.mine.map((c) => (
                <OwedItems
                  key={`owed-${c.id}`}
                  candidateId={c.id}
                  orgName={c.orgName}
                  given={owedFor?.[c.id]}
                  readOnly={readOnly}
                />
              ))}

            {p.applyUrl && !p.mine.length && !readOnly && (
              <a className="btn primary sm" style={{ alignSelf: 'flex-start' }} href={p.applyUrl}>
                <Icon name="form" size={13} /> {says('prog.apply')}
              </a>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * Your panels, under the programme that invited you. Grouped rather than made
 * into a screen of its own: with one programme and one panel, a page that only
 * held a link to another page would be a click for nothing.
 */
function Jury({ panels }: { panels: ReviewPanel[] }) {
  const waiting = stillWaiting(panels);

  const programmes = [...new Map(panels.map((p) => [`${p.programName}|${p.editionName}`, p])).values()];

  return (
    <>
      <div className="callout">
        <Icon name="gavel" size={15} />
        <div>
          {waiting
            ? `${waiting} startup${waiting === 1 ? '' : 's'} still waiting on you.`
            : 'Everything asked of you is done.'}{' '}
          What you write is yours — the others on a panel do not see it, and you do not see theirs.
        </div>
      </div>

      {programmes.map((head) => {
        const mine = panels.filter((p) => p.programName === head.programName && p.editionName === head.editionName);
        return (
          <section className="card" key={`${head.programName}|${head.editionName}`}>
            <div className="rowcard-head" style={{ padding: '13px 16px' }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 16 }}>{head.programName}</h2>
                <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
                  {head.editionName} · {head.committeeName}
                </p>
              </div>
            </div>
            <div className="rows" style={{ padding: 12 }}>
              {mine.map((panel) => (
                <Link className="rowcard link-row" key={panel.sessionId} to={`/review/${panel.sessionId}`}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{panel.sessionName}</span>
                    <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                      {panel.heldOn && panel.format === 'event'
                        ? formatDate(panel.heldOn)
                        : 'Spread over days'}
                    </span>
                  </span>
                  {panel.state === 'closed' && <span className="badge">Closed</span>}
                  {panel.state === 'not_open' && <span className="badge">Opens {formatDate(panel.opensAt)}</span>}
                  <span className={panel.done === panel.items.length ? 'badge ok num' : 'badge num'}>
                    {panel.done}/{panel.items.length}
                  </span>
                  <Icon name="chevronRight" size={14} />
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

/**
 * A record entered as one name — which is most of them, since that is what the
 * import and the quick add both write — has nothing in either half. Showing
 * two empty boxes to somebody whose name is on the screen above them reads as
 * though CEED holds nothing about them. The name is split on first sight so
 * they can correct it rather than retype it.
 */
function splitName(record: { firstName: string; lastName: string; name: string }) {
  if (record.firstName || record.lastName) return { firstName: record.firstName, lastName: record.lastName };
  const parts = record.name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: record.name.trim(), lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/**
 * Who somebody is, before what they have to fill in.
 *
 * This used to be six boxes asking a person to describe themselves before
 * showing them anything — a form pretending to be a page. What CEED already
 * knows is now what you read, and editing is a door you open when you want
 * to, not the state the screen is in.
 */
function Profile({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const { t } = useLang();
  const place = [me.record.city, me.record.country].filter(Boolean).join(', ');

  return (
    <>
      <section className="card card-pad profile-head">
        {/* The mark stands where a photograph will, at the same size, so
            adding one later moves nothing else on the page. */}
        <span className="profile-mark">{initials(me.record.name)}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <h1 className="profile-name">{me.record.name || t('my.noName')}</h1>
            <div className="spacer" />
            <button className="btn sm" onClick={() => setEditing(true)}>
              <Icon name="edit" size={13} /> {t('my.edit')}
            </button>
          </div>

          <p className="profile-line">
            {me.record.roles.length > 0 && <strong>{me.record.roles.join(' · ')}</strong>}
            {me.record.roles.length > 0 && place && ' — '}
            {place}
          </p>
          <p className="profile-line faint">{me.account.email}</p>

          {/* Highest thing on the page after the name, because it is the one
              a jury actually reads. */}
          {me.record.bio ? (
            <p className="profile-bio">{me.record.bio}</p>
          ) : (
            <button className="profile-bio-empty" onClick={() => setEditing(true)}>
              {t('my.aboutEmpty')}
            </button>
          )}
        </div>
      </section>

      {editing && (
        <ProfileModal me={me} onClose={() => setEditing(false)} onSaved={onSaved} />
      )}
    </>
  );
}

function ProfileModal({ me, onClose, onSaved }: { me: Me; onClose: () => void; onSaved: () => void }) {
  const known = splitName(me.record);
  const [draft, setDraft] = useState({
    ...known,
    phone: me.record.phone,
    city: me.record.city,
    country: me.record.country || 'Morocco',
    bio: me.record.bio,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { t } = useLang();
  const set = (partial: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...partial }));

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      await api.patch('/api/me', draft);
      onSaved();
      toast(t('my.saved'));
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else toast((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t('my.title')}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            {t('do.cancel')}
          </button>
          <div className="spacer" />
          <button className="btn primary" disabled={saving} onClick={save}>
            {saving ? t('do.saving') : t('do.save')}
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        {/* The line a jury reads comes first here too, so the two screens
            agree about what matters. */}
        <div className="field">
          <label>{t('my.about')}</label>
          <textarea
            className="textarea"
            rows={3}
            value={draft.bio}
            placeholder={t('my.aboutHelp')}
            onChange={(e) => set({ bio: e.target.value })}
          />
        </div>
        <div className="grid-2">
          <Text label={t('my.firstName')} value={draft.firstName} error={errors.firstName} onChange={(v) => set({ firstName: v })} />
          <Text label={t('my.lastName')} value={draft.lastName} error={errors.lastName} onChange={(v) => set({ lastName: v })} />
        </div>
        <div className="grid-2">
          <Text label={t('my.phone')} value={draft.phone} onChange={(v) => set({ phone: v })} placeholder="+212 6 …" />
          <Text label={t('prof.city')} value={draft.city} onChange={(v) => set({ city: v })} placeholder="Casablanca" />
        </div>
        <Text label={t('org.country')} value={draft.country} onChange={(v) => set({ country: v })} />
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          {t('my.emailFixed')}
        </p>
      </div>
    </Modal>
  );
}

/**
 * What attaches this person to CEED, in one glance and one click.
 *
 * It repeats nothing: each line is a sentence about them, and the detail lives
 * in the tab it points at. A profile that listed everything twice would be a
 * menu, not a profile.
 */
function Involvement({
  panels,
  programs,
  onGo,
}: {
  panels: ReviewPanel[];
  programs: MyProgram[];
  onGo: (tab: MemberTab) => void;
}) {
  const { t } = useLang();
  const applied = programs.filter((p) => p.mine.length > 0);
  const juries = [...new Map(panels.map((p) => [`${p.programName}|${p.editionName}`, p])).values()];
  if (!applied.length && !juries.length) return null;

  return (
    <section className="card">
      <div className="rowcard-head" style={{ padding: '13px 16px' }}>
        <h2 style={{ fontSize: 16, flex: 1 }}>{t('my.where')}</h2>
      </div>
      <div className="rows" style={{ padding: 12 }}>
        {juries.map((head) => {
          const mine = panels.filter((p) => p.programName === head.programName);
          const waiting = mine.filter((p) => p.state === 'open').reduce((n, p) => n + (p.items.length - p.done), 0);
          return (
            <button className="rowcard link-row" key={`j-${head.programName}`} onClick={() => onGo('Jury')}>
              <Icon name="gavel" size={14} />
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{head.programName}</span>
                <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                  {t('my.onJury')} · {mine.length} {mine.length === 1 ? t('my.panel') : t('my.panels')}
                  {waiting > 0 && ` · ${waiting} ${t('my.waitingOnYou')}`}
                </span>
              </span>
              <Icon name="chevronRight" size={14} />
            </button>
          );
        })}

        {applied.map((program) => (
          <button className="rowcard link-row" key={`a-${program.editionId}`} onClick={() => onGo('Programs')}>
            <Icon name="form" size={14} />
            <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{program.programName}</span>
              <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                {program.mine.map((c) => c.orgName).join(', ')} {t('prog.applied')}
              </span>
            </span>
            <Icon name="chevronRight" size={14} />
          </button>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Organisations({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const { t } = useLang();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AffiliationView | null>(null);
  const [team, setTeam] = useState<AffiliationView | null>(null);

  return (
    <section className="card">
      <div className="rowcard-head" style={{ padding: '13px 16px' }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 16 }}>{t('org.yours')}</h2>
          <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>{t('org.yoursMore')}</p>
        </div>
        <button className="btn primary sm" onClick={() => setCreating(true)}>
          <Icon name="plus" size={13} /> {t('org.create')}
        </button>
      </div>

      {!me.organisations.length ? (
        <div className="empty" style={{ padding: 24 }}>
          {/* Holding none is a normal state, not a step left undone: a mentor,
              a juror, somebody CEED simply knows. The empty box used to offer
              one thing to do and so read as a condition of entry. */}
          <p style={{ margin: 0 }}>
            <strong>{t('org.noneTitle')}</strong> {t('org.noneHead')}
          </p>
          <p className="faint" style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.6 }}>
            {t('org.noneMore')}
          </p>
        </div>
      ) : (
        <div className="rows" style={{ padding: 12 }}>
          {me.organisations.map((link) => (
            <div className="rowcard stack" key={link.affiliation.id} style={{ gap: 10 }}>
              <div className="row" style={{ gap: 10 }}>
              <span className="rec-mark">{initials(link.record.name)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{link.record.name}</span>
                <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                  {[
                    link.affiliation.role,
                    t(`access.${link.affiliation.access}` as const),
                    link.record.city,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <button className="btn sm" onClick={() => setTeam(link)}>
                <Icon name="users" size={13} /> {t('org.team')}
              </button>
              {canEditOrg(link.affiliation.access) && (
                <button className="btn sm" onClick={() => setEditing(link)}>
                  <Icon name="edit" size={13} /> {t('my.edit')}
                </button>
              )}
              </div>
              {/* Sous chaque page, où en est sa fiche — et la barre elle-même
                  ouvre le formulaire, pour qu'il n'y ait pas à chercher où. */}
              {canEditOrg(link.affiliation.access) && (
                <ProfileBar profile={profileOf(link.record)} onFill={() => setEditing(link)} />
              )}
            </div>
          ))}
        </div>
      )}

      {creating && (
        <OrgModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            onChanged();
          }}
        />
      )}

      {editing && (
        <OrgModal
          link={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}

      {team && <TeamModal link={team} onClose={() => setTeam(null)} />}
    </section>
  );
}

function OrgModal({
  link,
  onClose,
  onSaved,
}: {
  link?: AffiliationView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = Boolean(link);
  const [draft, setDraft] = useState({
    name: link?.record.name ?? '',
    roles: link?.record.roles ?? ['Startup'],
    email: link?.record.email ?? '',
    phone: link?.record.phone ?? '',
    city: link?.record.city ?? '',
    country: link?.record.country || 'Morocco',
    website: link?.record.website ?? '',
    bio: link?.record.bio ?? '',
    myRole: link?.affiliation.role ?? 'Founder',
    logoUploadId: link?.record.logoUploadId ?? null,
    pitch: link?.record.pitch ?? '',
    sector: link?.record.sector ?? '',
    stage: link?.record.stage ?? '',
    foundedYear: link?.record.foundedYear ?? null,
    teamSize: link?.record.teamSize ?? null,
    linkedin: link?.record.linkedin ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { t } = useLang();

  const set = (partial: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...partial }));

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      if (editing) {
        await api.patch(`/api/me/organisations/${link!.record.id}`, draft);
        toast(t('org.saved'));
      } else {
        const { joined } = await api.post<{ joined: boolean }>('/api/me/organisations', draft);
        toast(joined ? t('org.joined') : t('org.created'));
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else toast((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? draft.name : t('org.createTitle')}
      subtitle={editing ? undefined : t('org.createMore')}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            {t('do.cancel')}
          </button>
          <button className="btn primary" disabled={saving || !draft.name.trim()} onClick={save}>
            {saving ? t('do.saving') : editing ? t('do.save') : t('do.create')}
          </button>
        </>
      }
    >
      {/* En haut, et vivante : chaque champ rempli la fait monter pendant qu'on
          écrit, ce qui est la seule raison d'avoir une barre plutôt qu'une
          liste de champs. */}
      <ProfileBar profile={profileOf(draft)} />

      <Text label={t('org.name')} value={draft.name} error={errors.name} onChange={(v) => set({ name: v })} placeholder="Nakhla Bio" />

      <div className="field">
        <label>{t('org.what')}</label>
        <div className="work-pick">
          {ORG_ROLES.map((r) => (
            <button
              key={r}
              type="button"
              className={draft.roles.includes(r) ? 'track on' : 'track'}
              onClick={() => set({ roles: draft.roles.includes(r) ? draft.roles.filter((x) => x !== r) : [...draft.roles, r] })}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <Text label={t('org.myRole')} value={draft.myRole} onChange={(v) => set({ myRole: v })} placeholder="Fondateur" />

      {/* Ce qu'un jury lit : le même formulaire, parce que c'est la même fiche.
          Un second écran « profil » aurait fait deux endroits à tenir à jour. */}
      <ProfileFields draft={draft as ProfileDraft} set={(partial) => set(partial)} name={draft.name} />

      <div className="grid-2">
        <Text label={t('org.email')} value={draft.email} onChange={(v) => set({ email: v })} />
        <Text label={t('my.phone')} value={draft.phone} onChange={(v) => set({ phone: v })} />
      </div>
      <div className="grid-2">
        <Text label={t('org.city')} value={draft.city} onChange={(v) => set({ city: v })} />
        <Text label={t('org.country')} value={draft.country} onChange={(v) => set({ country: v })} />
      </div>
      <Text label={t('org.website')} value={draft.website} onChange={(v) => set({ website: v })} />
      <div className="field">
        <label>{t('prof.bio')}</label>
        <textarea className="textarea" rows={3} value={draft.bio} onChange={(e) => set({ bio: e.target.value })} />
      </div>
    </Modal>
  );
}

function Text({
  label,
  value,
  onChange,
  placeholder,
  error,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  /** A password is typed here too, and must not be readable over a shoulder. */
  type?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        className={error ? 'input bad' : 'input'}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <div style={{ color: 'var(--stop)', fontSize: 12 }}>{error}</div>}
    </div>
  );
}
