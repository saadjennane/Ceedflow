import {
  ORG_ROLES,
  canEditOrg,
  canManageTeam,
  profileDone,
  profileMissing,
  profileOf,
  meetingState,
  type ProfileSection,
  type OneToOneMeeting,
  type AffiliationView,
  type DirectoryRecord,
  type Me,
  type OrgProfile,
  type Task,
  type MemberHomeData, requiredShown, itemComplete, type DeliverableItem } from '@ceed/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { useAccount } from '../../lib/account';
import { formatDate } from '../../lib/format';
import { useAsync, type AsyncState } from '../../lib/useAsync';
import { stillWaiting } from '../../lib/panels';
import type { ReviewPanel } from './ReviewPage';
import { Icon } from '../../ui/Icon';
import { Modal, useSidebar, useToast } from '../../ui/Overlays';
import '../../ui/builder.css';
import '../../ui/directory.css';
import { initials } from '../directory/DirectoryPage';
import { OwedItems, type Owed } from './OwedItems';
import { type AgendaEntry } from './Agenda';
import { ProgramJourney, type Journey } from './ProgramJourney';
import { ProgramsSection } from './ProgramsSection';
import { MemberHome, type CandidacyState } from './MemberHome';
import { LangProvider, useLang } from '../../lib/lang';
import { TeamModal } from './TeamPanel';
import { PhoneLines } from '../../ui/PhoneLines';
import { PlaceLines } from '../../ui/PlaceLines';
import { ProfileBar, ProfileFacts } from '../../ui/OrgProfile';
import { KpiPanel } from '../../ui/KpiPanel';
import { OrgSheet, type SheetRoutes } from '../../ui/OrgSheet';
import { Coordinates, Hero, OrgContent, PersonContent, Ring, colourOf } from '../../ui/Showcase';
import { ASK_WORD } from '../../ui/OrgProfile';
import { ProfileBlocks } from '../../ui/ProfileBlocks';

/**
 * The member space: your profile, and the organisation pages you look after.
 * The profile is your directory record — editing it here is editing the row the
 * whole product already points at.
 */
/** The four places a member has. Jury only exists for somebody on a panel. */
const MEMBER_TABS = ['Home', 'Profile', 'Organisation', 'Programs', 'Jury', 'Mentoring', 'Settings'] as const;
/** The word each tab wears, in the language the member reads. */
const TAB_WORD = {
  Home: 'tab.home', Programs: 'tab.programs', Jury: 'tab.jury', Mentoring: 'tab.mentoring', Profile: 'tab.profile',
  Organisation: 'tab.organisation',
  Settings: 'tab.settings',
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
  /** Son parcours dans chaque programme, par candidature. */
  journeys?: Record<string, Journey | null>;
  /** Sa page d'accueil, lue comme elle la lit. */
  home?: MemberHomeData;
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

/**
 * La porte de l'espace : qui est connecté, et si son mot de passe est encore
 * provisoire. Rien de l'espace ne se charge avant qu'elle soit passée — sinon
 * les programmes, les tâches et les panels, demandés pendant que le mot de
 * passe était provisoire, gardaient le refus du serveur une fois le mot de
 * passe choisi, et l'onglet affichait « Choose your own password ».
 */
function MemberSpace({ preview }: { preview?: MemberPreview }) {
  const { me, loading, reload } = useAccount();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  /* Un formulaire de candidature qui attend : on est passé ici pour remplacer
     un mot de passe provisoire, et on y retourne. Seulement vers un
     formulaire, un panel de juré ou un rendez-vous — une adresse de retour
     libre enverrait n'importe où. */
  const next = params.get('next') ?? '';
  const returnTo = /^\/(apply|review|meeting)\//.test(next) ? next : '';

  useEffect(() => {
    if (!preview && !loading && !me) navigate('/login', { replace: true });
  }, [preview, loading, me, navigate]);

  /* Le mot de passe remplacé, on retourne au formulaire sans chercher le lien. */
  useEffect(() => {
    if (preview || !returnTo || !me || me.account.mustChangePassword) return;
    navigate(returnTo, { replace: true });
  }, [preview, returnTo, me, navigate]);

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
        // Une candidature en attente reprend la main juste après : l'effet de
        // retour voit le mot de passe changé et ramène au formulaire.
        onDone={() => (me!.account.staffRole ? navigate('/', { replace: true }) : reload())}
      />
    );
  }

  return <MemberSpaceReady preview={preview} me={me} reload={reload} />;
}

function MemberSpaceReady({
  preview,
  me,
  reload,
}: {
  preview?: MemberPreview;
  me: Me | null;
  reload: () => Promise<void>;
}) {
  const { lang, setLang, t } = useLang();
  const toast = useToast();
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
  /* Les rendez-vous où l'on est l'interlocuteur : l'onglet n'existe que s'il y en a. */
  const meetings = useAsync<MyMeeting[]>(
    async () => (preview ? [] : api.get<MyMeeting[]>('/api/me/meetings')),
    preview ? 'preview-meetings' : 'my-meetings',
  );
  const meets = (meetings.data?.length ?? 0) > 0;
  /* Settings holds a password and a way out of the account — neither means
     anything about somebody else's page. */
  const tabs = MEMBER_TABS.filter(
    (t) =>
      (t !== 'Jury' || isJuror) &&
      (t !== 'Mentoring' || meets) &&
      (t !== 'Settings' || !preview) &&
      (t !== 'Organisation' || (!preview && (me?.organisations.length ?? 0) > 0)),
  );
  /* « Meetings » est devenu « Mentoring » : un ancien lien y mène encore. */
  const askedRaw = params.get('tab');
  const asked = (askedRaw === 'Meetings' ? 'Mentoring' : askedRaw) as MemberTab | null;
  /* On ouvre là où il y a quelque chose à faire.
     Nobody signs in to read their own profile: a founder comes to see what is
     still asked of them, a juror to see what is left to mark. Profile is where
     you end up when neither is true. */
  const landing: MemberTab =
    (programs.data?.length ?? 0) > 0 ? 'Home' : isJuror ? 'Jury' : meets ? 'Mentoring' : 'Profile';
  const tab: MemberTab = asked && tabs.includes(asked) ? asked : landing;
  const [folded, setFolded] = useSidebar();
  /* Sur un téléphone, le menu s'ouvre par-dessus la page et se referme en choisissant. */
  const [navOpen, setNavOpen] = useState(false);
  const setTab = (next: MemberTab) => {
    setNavOpen(false);
    setParams((p) => {
      const q = new URLSearchParams(p);
      q.set('tab', next);
      q.delete('prog');
      return q;
    });
  };
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

  /* Tout ce qu'il y a à faire et ce qui vient, lu une fois côté serveur sur
     les objets eux-mêmes : tâches, livrables, fiche, évaluations, comptes
     rendus, créneaux à choisir ou à confirmer. */
  const home = useAsync<MemberHomeData>(
    async () => (preview ? { actions: [], upcoming: [] } : api.get('/api/me/actions')),
    preview ? 'preview-home' : 'my-home',
  );

  /* Ce que CEED demande en propre : les siennes, et celles des sociétés dont
     elle tient la page. En aperçu, rien — on regarde une page, on n'agit pas. */
  const tasks = useAsync<Task[]>(
    async () => (preview ? [] : api.get<Task[]>('/api/me/tasks')),
    preview ? 'preview-tasks' : 'my-tasks',
  );


  /* Ce qui attend dans chaque programme : les lignes de la Home, comptées. */
  const pendingByEdition = new Map<string, number>();
  for (const a of home.data?.actions ?? []) if (a.editionId) pendingByEdition.set(a.editionId, (pendingByEdition.get(a.editionId) ?? 0) + 1);

  const name = preview ? (preview.who?.name ?? preview.orgName) : me!.record.name;
  const email = preview ? (preview.who?.email ?? '') : me!.account.email;

  const ICON: Record<MemberTab, string> = {
    Home: 'home', Profile: 'users', Organisation: 'layers', Programs: 'layers', Jury: 'gavel', Mentoring: 'compass', Settings: 'settings',
  };
  const waitingJury = stillWaiting(panels.data ?? []);
  const main = tabs.filter((t) => t !== 'Settings');
  /* Ses organisations : une seule a son nom dans le menu ; plusieurs, une entrée et chacune dessous. */
  const orgs = me?.organisations ?? [];
  const currentOrg = params.get('org') ?? orgs[0]?.record.id ?? '';
  const setOrg = (orgId: string) => {
    setNavOpen(false);
    setParams((p) => {
      const q = new URLSearchParams(p);
      q.set('tab', 'Organisation');
      q.set('org', orgId);
      q.delete('prog');
      return q;
    });
  };
  const orgMark = (r: DirectoryRecord) => (
    <span className="sc-mini" style={{ background: colourOf(r.name) }}>
      {r.logoUploadId ? <img src={`/api/uploads/${r.logoUploadId}`} alt="" /> : r.name.slice(0, 1).toUpperCase()}
    </span>
  );

  return (
    <div className={`shell member-layout${folded ? ' folded' : ''}${navOpen ? ' nav-open' : ''}`}>
      {/* La navigation de l'espace : à gauche, repliable, et en tiroir sur un téléphone. */}
      <nav className="sidebar member-side" aria-label={lang === 'fr' ? 'Votre espace' : 'Your space'}>
        <div className="brand">
          <div className="brand-mark">C</div>
          <div className="brand-text">
            <div className="brand-name">CeedFlow</div>
            <div className="brand-sub">{lang === 'fr' ? 'Votre espace' : 'Your space'}</div>
          </div>
        </div>
        <button
          className="fold"
          onClick={() => setFolded(!folded)}
          aria-expanded={!folded}
          aria-label={folded ? 'Open the menu' : 'Fold the menu'}
          title={folded ? 'Open the menu' : 'Fold the menu'}
        >
          <Icon name={folded ? 'chevronRight' : 'chevronLeft'} size={13} />
        </button>
        {main.map((name) =>
          name === 'Organisation' ? (
            orgs.length === 1 ? (
              <button
                key={name}
                className={tab === 'Organisation' ? 'nav-item on' : 'nav-item'}
                title={orgs[0]!.record.name}
                onClick={() => setOrg(orgs[0]!.record.id)}
              >
                {orgMark(orgs[0]!.record)}
                <span className="nav-label">{orgs[0]!.record.name}</span>
              </button>
            ) : (
              <div key={name} className="stack" style={{ gap: 2 }}>
                <button
                  className={tab === 'Organisation' ? 'nav-item on' : 'nav-item'}
                  title={t(TAB_WORD.Organisation)}
                  onClick={() => setOrg(currentOrg)}
                >
                  <Icon name="layers" />
                  <span className="nav-label">{t(TAB_WORD.Organisation)}</span>
                  <span className="nav-count">{orgs.length}</span>
                </button>
                {orgs.map((l) => (
                  <button
                    key={l.record.id}
                    className={tab === 'Organisation' && currentOrg === l.record.id ? 'nav-item sub on' : 'nav-item sub'}
                    title={l.record.name}
                    onClick={() => setOrg(l.record.id)}
                  >
                    {orgMark(l.record)}
                    <span className="nav-label">{l.record.name}</span>
                  </button>
                ))}
              </div>
            )
          ) : (
          <button
            key={name}
            className={name === tab ? 'nav-item on' : 'nav-item'}
            aria-current={name === tab ? 'page' : undefined}
            title={t(TAB_WORD[name])}
            onClick={() => setTab(name)}
          >
            <Icon name={ICON[name]} />
            <span className="nav-label">{t(TAB_WORD[name])}</span>
            {name === 'Jury' && waitingJury > 0 && <span className="nav-count warn">{waitingJury}</span>}
            {name === 'Home' && (home.data?.actions.length ?? 0) > 0 && (
              <span className="nav-count">{home.data!.actions.length}</span>
            )}
          </button>
          ),
        )}

        <div className="sidebar-foot stack" style={{ gap: 6 }}>
          <div className="who row" style={{ gap: 8 }}>
            <span className="rec-mark">{initials(name)}</span>
            <span className="who-text" style={{ minWidth: 0 }}>
              <strong style={{ fontSize: 12.5, display: 'block' }}>{name}</strong>
              <span className="faint" style={{ fontSize: 11.5, overflowWrap: 'anywhere' }}>{email}</span>
            </span>
          </div>
          {/* Deux langues, offertes depuis la page : CEED écrit en français à
              des fondateurs marocains, et un jury ne l'est pas toujours. */}
          <div className="seg" role="group" aria-label={t('bar.lang')}>
            <button className={lang === 'fr' ? 'on' : ''} onClick={() => setLang('fr')}>FR</button>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
          </div>
          {tabs.includes('Settings') && (
            <button className={tab === 'Settings' ? 'nav-item on' : 'nav-item'} title={t(TAB_WORD.Settings)} onClick={() => setTab('Settings')}>
              <Icon name="settings" />
              <span className="nav-label">{t(TAB_WORD.Settings)}</span>
            </button>
          )}
          {!preview && me!.account.staffRole && (
            <Link className="nav-item" to="/" title={t('bar.workspace')}>
              <Icon name="grid" />
              <span className="nav-label">{t('bar.workspace')}</span>
            </Link>
          )}
          {!preview && (
            <button
              className="nav-item"
              title={t('bar.signOut')}
              onClick={async () => {
                await api.post('/api/auth/logout');
                navigate('/login');
              }}
            >
              <Icon name="arrowRight" />
              <span className="nav-label">{t('bar.signOut')}</span>
            </button>
          )}
        </div>
      </nav>
      {navOpen && <div className="member-scrim" onClick={() => setNavOpen(false)} />}

      <div className="member-main">
        {/* Sur un téléphone : le titre de la section, et le menu derrière un bouton. */}
        <div className="member-top">
          <button className="btn ghost icon sm" aria-label="Menu" onClick={() => setNavOpen(true)}>
            <Icon name="list" size={16} />
          </button>
          <strong style={{ fontSize: 14 }}>{t(TAB_WORD[tab])}</strong>
        </div>

      {preview && (
        <div className="callout" style={{ margin: '10px 14px 0' }}>
          <Icon name="eye" size={15} />
          <div>
            <strong>{preview.orgName} — read-only.</strong> This is their page, drawn by the same code they load.
            Nothing here writes to their file.
          </div>
        </div>
      )}

      {/* Un compte de l'espace de test le sait : il ne voit que les programmes de test. */}
      {!preview && me?.record.testOwner && (
        <div className="callout warn" style={{ margin: '10px 14px 0' }}>
          <Icon name="alert" size={15} />
          <div>
            <strong>{t('test.banner')}</strong> {t('test.bannerMore')}
          </div>
        </div>
      )}

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
            <Organisations me={me!} onChanged={reload} onOpen={setOrg} />
            <Involvement panels={panels.data ?? []} programs={programs.data ?? []} onGo={setTab} />
          </>
        )}
        {tab === 'Home' && (
          <MemberHome
            home={preview ? (preview.home ?? { actions: [], upcoming: [] }) : (home.data ?? null)}
            error={preview ? null : home.error}
            firstName={name.split(/\s+/)[0] || undefined}
            programs={programs.data ?? []}
            documents={(states.data ?? []).map((st) => ({
              editionId: st.programme.editionId,
              programName: st.programme.programName,
              lists: st.owed.map((ask) => {
                const mine = (id: string) => ask.returns.find((r) => r.itemId === id);
                const need = requiredShown(ask.config.items as DeliverableItem[], (id) => mine(id)?.value);
                return {
                  name: ask.block.name,
                  sent: need.filter((i) => itemComplete(i, mine(i.id)?.value)).length,
                  of: need.length,
                  accepted: ask.returns.filter((r) => r.state === 'accepted').length,
                  back: ask.returns.filter((r) => r.state === 'rejected').length,
                };
              }),
            }))}
            onTick={async (task) => {
              try {
                await api.patch(`/api/me/tasks/${task.id}`, { state: 'done' });
              } catch (err) {
                toast((err as Error).message, true);
              }
              home.reload();
              tasks.reload();
            }}
            onTickItem={async (task, item) => {
              try {
                await api.patch(`/api/me/tasks/${task.id}/items/${item.id}`, { done: !item.done });
              } catch (err) {
                toast((err as Error).message, true);
              }
              home.reload();
              tasks.reload();
            }}
            onOpen={setEdition}
            onGo={(href) => (preview ? undefined : navigate(href))}
          />
        )}
        {tab === 'Programs' &&
          (openEdition ? (
            <ProgramJourney
              state={(states.data ?? []).find((x) => x.programme.editionId === openEdition) ?? null}
              home={preview ? (preview.home ?? { actions: [], upcoming: [] }) : (home.data ?? null)}
              onOwed={(candidateId, owed) =>
                states.set((states.data ?? []).map((x) => (x.candidateId === candidateId ? { ...x, owed } : x)))
              }
              readOnly={Boolean(preview)}
              previewJourneys={preview?.journeys}
              onBack={() => setEdition('')}
              onTick={async (task) => {
                await api.patch(`/api/me/tasks/${task.id}`, { state: 'done' }).catch((err) => toast((err as Error).message, true));
                home.reload();
              }}
              onTickItem={async (task, item) => {
                await api.patch(`/api/me/tasks/${task.id}/items/${item.id}`, { done: !item.done }).catch((err) => toast((err as Error).message, true));
                home.reload();
              }}
              onGo={(href) => (preview ? undefined : navigate(href))}
            />
          ) : (
            <ProgramsSection
              programs={programs}
              pendingByEdition={pendingByEdition}
              readOnly={Boolean(preview)}
              onOpen={setEdition}
            />
          ))}
        {tab === 'Jury' && <Jury panels={panels.data ?? []} />}
        {tab === 'Mentoring' && (
          <Meetings meetings={meetings.data ?? []} />
        )}
        {tab === 'Organisation' && me && (
          <OrgShowcase me={me} orgId={currentOrg} programs={programs.data ?? []} onPick={setOrg} onChanged={reload} />
        )}
        {tab === 'Settings' && !preview && <Settings me={me!} />}
      </div>
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
  mine: { id: string; orgId?: string; orgName: string; status?: string; phase?: string | null }[];
  eligibility?: string[];
  closesAt?: string | null;
  colour?: string;
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
/** Mes rendez-vous d'interlocuteur : à venir d'abord, puis ceux dont le compte rendu attend. */
interface MyMeeting extends OneToOneMeeting {
  programName: string;
  blockName: string;
  state: 'open' | 'closed';
}

function Meetings({ meetings }: { meetings: MyMeeting[] }) {
  const { lang } = useLang();
  const fr = lang === 'fr';
  const today = new Date().toISOString().slice(0, 10);
  const [side, setSide] = useState<'upcoming' | 'due' | 'past'>('upcoming');
  const [programme, setProgramme] = useState('');
  const programmes = [...new Set(meetings.map((m) => m.programName))];
  const scoped = meetings.filter((m) => !programme || m.programName === programme);
  /* Un CR à écrire : la séance a eu lieu, la brique est ouverte, et rien n'est envoyé. */
  const due = (m: MyMeeting) =>
    meetingState(m) !== 'reported' && m.state === 'open' && Boolean(m.heldOn && m.heldOn <= today) && m.status !== 'cancelled';
  const lists = {
    upcoming: scoped.filter((m) => (!m.heldOn || m.heldOn >= today) && m.status !== 'cancelled'),
    due: scoped.filter(due),
    past: scoped.filter((m) => m.heldOn && m.heldOn < today).reverse(),
  };
  const row = (m: MyMeeting) => {
    const state = meetingState(m);
    return (
      <Link className="rowcard link-row" key={m.id} to={`/meeting/${m.id}`}>
        <Icon name="users" size={14} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 13 }}>{m.orgName}</strong>
          <span className="faint" style={{ display: 'block', fontSize: 12 }}>
            {[m.heldOn ? `${formatDate(m.heldOn)}${m.startTime ? ` · ${m.startTime}` : ''}` : null, m.location || null, m.programName, m.blockName]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        {state === 'reported' ? (
          <span className="badge ok">{fr ? 'CR envoyé' : 'Report sent'}</span>
        ) : due(m) ? (
          <span className="badge warn">{fr ? 'CR à écrire' : 'Report due'}</span>
        ) : null}
        <Icon name="chevronRight" size={14} />
      </Link>
    );
  };
  const words = {
    upcoming: fr ? 'À venir' : 'Coming up',
    due: fr ? 'Comptes rendus à remplir' : 'Reports to write',
    past: fr ? 'Historique' : 'History',
  };
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row wrap" style={{ gap: 6 }}>
        {(['upcoming', 'due', 'past'] as const).map((k) => (
          <button key={k} className={side === k ? 'track on' : 'track'} aria-pressed={side === k} onClick={() => setSide(k)}>
            {words[k]} <span className="num">{lists[k].length}</span>
          </button>
        ))}
        <div className="spacer" />
        {programmes.length > 1 && (
          <select className="input" style={{ width: 'auto' }} value={programme} onChange={(e) => setProgramme(e.target.value)}>
            <option value="">{fr ? 'Tous les programmes' : 'All programmes'}</option>
            {programmes.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}
      </div>
      <section className="card card-pad stack" style={{ gap: 8 }}>
        <div className="eyebrow">{fr ? 'Sessions individuelles — One to One' : 'One-to-one sessions'}</div>
        {lists[side].length ? (
          lists[side].map(row)
        ) : (
          <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
            {side === 'due' ? (fr ? 'Aucun compte rendu en attente.' : 'No report waiting.') : fr ? 'Rien ici.' : 'Nothing here.'}
          </p>
        )}
      </section>
    </div>
  );
}

function Jury({ panels: all }: { panels: ReviewPanel[] }) {
  const { lang } = useLang();
  const fr = lang === 'fr';
  const waiting = stillWaiting(all);
  /* À évaluer, ou terminées : une séance l'est quand chaque startup a sa note. */
  const [side, setSide] = useState<'todo' | 'done' | 'all'>('todo');
  const finished = (p: ReviewPanel) => p.done === p.items.length || p.state === 'closed';
  const panels = all.filter((p) => (side === 'all' ? true : side === 'done' ? finished(p) : !finished(p)));

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
      <div className="row wrap" style={{ gap: 6 }}>
        {(['todo', 'done', 'all'] as const).map((k) => (
          <button key={k} className={side === k ? 'track on' : 'track'} aria-pressed={side === k} onClick={() => setSide(k)}>
            {k === 'todo' ? (fr ? 'À évaluer' : 'To mark') : k === 'done' ? (fr ? 'Terminées' : 'Done') : fr ? 'Toutes' : 'All'}
          </button>
        ))}
      </div>
      {!panels.length && (
        <div className="empty">{side === 'todo' ? (fr ? 'Aucune évaluation en attente.' : 'Nothing left to mark.') : fr ? 'Rien ici.' : 'Nothing here.'}</div>
      )}

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
  const { t, lang } = useLang();

  return (
    <>
      <Hero
        name={me.record.name || t('my.noName')}
        imageId={me.record.logoUploadId}
        round
        subtitle={
          me.record.jobTitle || me.organisations[0]
            ? `${me.record.jobTitle || me.organisations[0]?.affiliation.role || ''}${me.organisations[0] ? ` @ ${me.organisations[0].record.name}` : ''}`
            : undefined
        }
        chips={me.record.roles.map((r) => (
          <span key={r} className="badge info">{r}</span>
        ))}
        side={
          <button className="btn primary sm" onClick={() => setEditing(true)}>
            <Icon name="edit" size={13} /> {t('my.edit')}
          </button>
        }
      />
      <div className="sc-two">
        {me.record.bio ? (
          <PersonContent
            bio={me.record.bio}
            lang={lang}
            facts={[
              [lang === 'fr' ? 'Fonction' : 'Job title', me.record.jobTitle],
              [lang === 'fr' ? 'Organisations' : 'Organisations', me.organisations.map((o) => o.record.name).join(', ')],
            ]}
          />
        ) : (
          <section className="card card-pad">
            <button className="profile-bio-empty" onClick={() => setEditing(true)}>
              {t('my.aboutEmpty')}
            </button>
          </section>
        )}
        <Coordinates
          emails={[me.account.email, ...me.record.emails.filter((e) => e !== me.account.email)]}
          phones={me.record.phones}
          places={me.record.places}
          linkedin={me.record.linkedin}
          website={me.record.website}
          lang={lang}
        />
      </div>

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
    phones: me.record.phones,
    places: me.record.places,
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
        <PlaceLines label={t('prof.city')} values={draft.places} onChange={(v) => set({ places: v })} />
        <PhoneLines label={t('my.phone')} values={draft.phones} onChange={(v) => set({ phones: v })} />
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

function Organisations({ me, onChanged, onOpen }: { me: Me; onChanged: () => void; onOpen?: (orgId: string) => void }) {
  const { t, lang } = useLang();
  const [creating, setCreating] = useState(false);
  /* La fiche ouverte : celle d'une page qu'on tient, ou celle qu'on vient de créer. */
  const [editing, setEditing] = useState<{ record: DirectoryRecord; manage: boolean; section?: ProfileSection } | null>(null);
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
              {/* Son logo, là où elle le dépose : ne pas le lui montrer sur
                  sa propre liste donne l'impression qu'il n'est pas arrivé. */}
              {link.record.logoUploadId ? (
                <img className="rec-photo" src={`/api/uploads/${link.record.logoUploadId}`} alt="" />
              ) : (
                <span className="rec-mark">{initials(link.record.name)}</span>
              )}
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
              <span className="badge num">{profileDone(profileOf(link.record))} %</span>
              {onOpen ? (
                <button className="btn sm" onClick={() => onOpen(link.record.id)}>
                  {lang === 'fr' ? 'Ouvrir' : 'Open'} <Icon name="chevronRight" size={13} />
                </button>
              ) : (
                canEditOrg(link.affiliation.access) && (
                  <button
                    className="btn sm"
                    onClick={() => setEditing({ record: link.record, manage: canManageTeam(link.affiliation.access) })}
                  >
                    <Icon name="edit" size={13} /> {t('my.edit')}
                  </button>
                )
              )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rechargé quand la fenêtre de création se ferme : une demande vient peut-être de partir. */}
      <PendingRequests key={String(creating)} />

      {creating && (
        <OrgModal
          onClose={() => setCreating(false)}
          onSaved={(created) => {
            setCreating(false);
            onChanged();
            /* Une page qu'on vient d'ouvrir s'ouvre sur sa fiche : c'est le
               moment où l'on a envie de la remplir. Une page rejointe a déjà
               ses administrateurs, et pas de fiche à nous de remplir. */
            if (created) setEditing({ record: created, manage: true });
          }}
        />
      )}

      {editing && (
        <OrgSheet
          record={editing.record}
          startAt={editing.section}
          routes={memberSheetRoutes(editing.record.id, editing.manage)}
          onChanged={() => {}}
          onClose={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}

      {team && <TeamModal link={team} onClose={() => setTeam(null)} />}
    </section>
  );
}

/**
 * Ouvrir une page d'organisation : trois choses, et la fiche ensuite.
 *
 * S'inscrire doit être rapide. Le nom, ce qu'elle est, ce qu'on y fait — le
 * reste se remplit dans la fiche, qui s'ouvre juste après, section par
 * section, et se complète plus tard si l'on veut.
 */
function OrgModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  /** La page créée, ou null quand on a rejoint une page qui existait déjà. */
  onSaved: (created: DirectoryRecord | null) => void;
}) {
  const [draft, setDraft] = useState({ name: '', roles: ['Startup'] as string[], myRole: 'Founder' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { t } = useLang();

  const set = (partial: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...partial }));

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const { organisation, joined, pending } = await api.post<{
        organisation: DirectoryRecord;
        joined: boolean;
        pending: boolean;
      }>('/api/me/organisations', draft);
      toast(pending ? t('org.pending') : joined ? t('org.joined') : t('org.created'));
      onSaved(joined || pending ? null : organisation);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else toast((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t('org.createTitle')}
      subtitle={t('org.createMore')}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            {t('do.cancel')}
          </button>
          <button className="btn primary" disabled={saving || !draft.name.trim()} onClick={save}>
            {saving ? t('do.saving') : t('do.create')}
          </button>
        </>
      }
    >
      <Text label={t('org.name')} value={draft.name} error={errors.name} onChange={(v) => set({ name: v })} placeholder={t('org.name')} />

      <div className="field">
        <label>{t('org.what')}</label>
        <div className="work-pick">
          {/* « Funder » est une qualification de CEED, pas ce qu'une startup dit d'elle-même. */}
          {ORG_ROLES.filter((r) => r !== 'Funder').map((r) => (
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

/** Les organisations qu'on a demandé à rejoindre, et qui n'ont pas encore répondu. */
function PendingRequests() {
  const { t } = useLang();
  const toast = useToast();
  const requests = useAsync(() => api.get<{ id: string; orgName: string; createdAt: string }[]>('/api/me/requests'), 'requests');
  if (!requests.data?.length) return null;
  const withdraw = async (id: string) => {
    try {
      await api.del(`/api/me/requests/${id}`);
      requests.reload();
    } catch (err) {
      toast((err as Error).message, true);
    }
  };
  return (
    <div className="rows" style={{ padding: '0 12px 12px' }}>
      {requests.data.map((r) => (
        <div className="rowcard row" key={r.id} style={{ gap: 10 }}>
          <span className="rec-mark">{initials(r.orgName)}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{r.orgName}</span>
            <span className="faint" style={{ display: 'block', fontSize: 12 }}>{t('org.requestWaiting')}</span>
          </span>
          <button className="btn sm ghost" onClick={() => withdraw(r.id)}>
            {t('org.requestWithdraw')}
          </button>
        </div>
      ))}
    </div>
  );
}

/** Où écrit la fiche d'une organisation, depuis l'espace d'un de ses membres. */
function memberSheetRoutes(id: string, manage: boolean): SheetRoutes {
  return {
    record: `/api/me/organisations/${id}`,
    revenue: (year) => `/api/me/organisations/${id}/revenues/${year}`,
    list: (list, itemId) => `/api/me/organisations/${id}/${list}${itemId ? `/${itemId}` : ''}`,
    team: `/api/me/organisations/${id}/team`,
    affiliation: (aid) => `/api/me/organisations/${id}/team/${aid}`,
    join: { kind: 'member', url: `/api/me/organisations/${id}/team` },
    manageTeam: manage,
    need: (need) => `/api/me/organisations/${id}/needs/${need}`,
    documents: (docId) => `/api/me/organisations/${id}/documents${docId ? `/${docId}` : ''}`,
    attributes: `/api/me/organisations/${id}/attributes`,
  };
}

/**
 * Une organisation, telle que son membre la voit : sa vitrine.
 *
 * Its hero with the programmes it took part in, how complete it is and what
 * is left, what it does in words and how to reach it, its blocks — each
 * opening on its own — and its indicators. Several organisations: tabs above
 * to go from one to the other.
 */
function OrgShowcase({
  me,
  orgId,
  programs,
  onPick,
  onChanged,
}: {
  me: Me;
  orgId: string;
  programs: MyProgram[];
  onPick: (orgId: string) => void;
  onChanged: () => void;
}) {
  const { t, lang } = useLang();
  const fr = lang === 'fr';
  const [editing, setEditing] = useState<{ section?: ProfileSection } | null>(null);
  const [team, setTeam] = useState<AffiliationView | null>(null);
  const [asJury, setAsJury] = useState(false);
  const link = me.organisations.find((l) => l.record.id === orgId) ?? me.organisations[0];
  if (!link) return <div className="empty">{t('org.noneTitle')}</div>;
  const record = link.record;
  const profile = profileOf(record);
  const done = profileDone(profile);
  const missing = profileMissing(profile);
  const canEdit = canEditOrg(link.affiliation.access);
  const manage = canManageTeam(link.affiliation.access);

  /* Ses programmes, en médailles : participante, alumni, candidate. */
  const medals = programs.flatMap((p) =>
    p.mine
      .filter((c) => c.orgId === record.id || (!c.orgId && c.orgName === record.name))
      .map((c) => ({
        key: c.id,
        colour: p.colour ?? 'var(--blue)',
        initial: p.programName.slice(0, 1).toUpperCase(),
        label:
          c.status === 'Selected'
            ? `${p.editionStatus === 'Completed' ? 'Alumni' : fr ? 'Participante' : 'Taking part'} · ${p.programName} ${p.editionName}`
            : `${fr ? 'Candidate' : 'Applied'} · ${p.programName} ${p.editionName}`,
      })),
  );

  return (
    <div className="stack" style={{ gap: 14 }}>
      {me.organisations.length > 1 && (
        <div className="sc-orgtabs" role="tablist" aria-label={fr ? 'Mes organisations' : 'My organisations'}>
          {me.organisations.map((l) => (
            <button key={l.record.id} role="tab" aria-selected={l.record.id === record.id} className={l.record.id === record.id ? 'on' : ''} onClick={() => onPick(l.record.id)}>
              <span className="sc-mini" style={{ background: colourOf(l.record.name) }}>
                {l.record.logoUploadId ? <img src={`/api/uploads/${l.record.logoUploadId}`} alt="" /> : l.record.name.slice(0, 1).toUpperCase()}
              </span>
              {l.record.name}
              <span className="badge num">{profileDone(profileOf(l.record))} %</span>
            </button>
          ))}
        </div>
      )}

      <Hero
        name={record.name}
        imageId={record.logoUploadId}
        pitch={record.pitch || undefined}
        chips={medals.map((m) => (
          <span key={m.key} className="medal">
            <i style={{ background: m.colour }}>{m.initial}</i>
            {m.label}
          </span>
        ))}
        side={
          <>
            <div className="seg" role="group">
              <button className={!asJury ? 'on' : ''} onClick={() => setAsJury(false)}>{fr ? 'Ma fiche' : 'My sheet'}</button>
              <button className={asJury ? 'on' : ''} onClick={() => setAsJury(true)}>{fr ? 'Vue jury' : 'As a jury reads it'}</button>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn sm" onClick={() => setTeam(link)}>
                <Icon name="users" size={13} /> {t('org.team')}
              </button>
              {canEdit && (
                <button className="btn primary sm" onClick={() => setEditing({})}>
                  <Icon name="edit" size={13} /> {t('my.edit')}
                </button>
              )}
            </div>
          </>
        }
      />

      {asJury ? (
        <section className="card card-pad">
          <ProfileFacts profile={profile} name={record.name} />
        </section>
      ) : (
        <>
          {/* Où en est la fiche, et ce qui la complèterait. */}
          {canEdit && done < 100 && (
            <section className="card card-pad row" style={{ gap: 16, alignItems: 'center' }}>
              <Ring value={done} label={fr ? 'complète' : 'complete'} tone="blue" />
              <div className="stack" style={{ gap: 6, flex: 1, minWidth: 0 }}>
                <strong style={{ fontFamily: 'var(--display)', fontSize: 15 }}>
                  {fr ? `Encore ${missing.length} information${missing.length > 1 ? 's' : ''} pour une fiche complète` : `${missing.length} thing${missing.length > 1 ? 's' : ''} left for a complete sheet`}
                </strong>
                {missing.slice(0, 2).map((k) => (
                  <div key={k} className="sc-nudge">
                    {fr ? 'Ajoutez' : 'Add'} <span>{t(ASK_WORD[k])}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="sc-two">
            <OrgContent
              profile={profile}
              lang={lang}
              empty={
                canEdit ? (
                  <button className="linkish" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing({ section: 'activity' })}>
                    {fr ? 'Décrivez votre activité, le problème que vous résolvez et votre solution' : 'Describe your activity, the problem you solve and your solution'}
                  </button>
                ) : undefined
              }
            />
            <Coordinates
              emails={record.emails}
              phones={record.phones}
              places={record.places}
              website={record.website}
              linkedin={record.linkedin}
              socials={profile.socials}
              lang={lang}
            />
          </div>

          <ProfileBlocks record={record} lang={lang} onEdit={canEdit ? (sec) => setEditing({ section: sec }) : undefined} />

          <section className="card card-pad">
            <KpiPanel key={`${record.id}:${editing ? 'e' : 's'}`} url={`/api/me/organisations/${record.id}/kpis`} lang={lang} editable={canEdit} />
          </section>
        </>
      )}

      {editing && (
        <OrgSheet
          record={record}
          startAt={editing.section}
          routes={memberSheetRoutes(record.id, manage)}
          onChanged={() => {}}
          onClose={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
      {team && <TeamModal link={team} onClose={() => setTeam(null)} />}
    </div>
  );
}
