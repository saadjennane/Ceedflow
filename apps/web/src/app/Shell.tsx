import { ORG_SECTIONS, STAFF_ROLE_LABEL } from '@ceed/shared';
import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAccount } from '../lib/account';
import { prefetchDirectory } from '../lib/directoryCache';
import { enterCenter, useNetwork, type NetworkMe } from '../lib/network';
import { PopCard } from '../ui/PopCard';
import { useUnread } from '../ui/Notifications';
import { api } from '../lib/api';
import { stillWaiting } from '../lib/panels';
import { useAsync } from '../lib/useAsync';
import type { ReviewPanel } from '../pages/member/ReviewPage';
import { Icon } from '../ui/Icon';
import { useSidebar, useTheme } from '../ui/Overlays';
import { isLate, type Task } from '@ceed/shared';

/**
 * The navigation the prototype settled on. Sections that exist in the model but
 * are not built yet stay visible and inert, so the shape of the product is legible.
 */

const COMMUNITY_LATER = [
  { label: 'CRM', icon: 'compass' },
  { label: 'Campaigns', icon: 'send' },
];

const PROGRAMS_LATER = [
  { label: 'Calendar', icon: 'calendar' },
  { label: 'Reports', icon: 'grid' },
];

export function Shell() {
  const [theme, setTheme] = useTheme();
  const [folded, setFolded] = useSidebar();
  const network = useNetwork();
  const unread = useUnread();
  const where = useLocation();
  const atGlobal = where.pathname.startsWith('/network');
  const { me, loading } = useAccount();
  const navigate = useNavigate();
  const staffRole = me?.account.staffRole ?? null;
  /* Somebody at CEED is often also on a panel — the ecosystem is small enough
     that the person running the programme judges in it too. The route already
     worked; what was missing was a way in that did not go through Settings. */
  const panels = useAsync<ReviewPanel[]>(
    () => (staffRole ? api.get<ReviewPanel[]>('/api/me/reviews') : Promise.resolve([])),
    `panels:${staffRole ?? 'none'}`,
  );
  const onAPanel = (panels.data?.length ?? 0) > 0;
  /* Ce qui a dépassé sa date, compté une fois pour la barre et pour l'accueil :
     c'est la seule chose d'une liste de tâches qui ne peut pas attendre qu'on
     pense à aller la regarder. */
  const tasks = useAsync<Task[]>(
    () => (staffRole ? api.get<Task[]>('/api/tasks?open=open') : Promise.resolve([])),
    `tasks:${staffRole ?? 'none'}`,
  );
  const late = (tasks.data ?? []).filter((t) => isLate(t)).length;
  const waiting = stillWaiting(panels.data ?? []);

  useEffect(() => {
    if (loading || staffRole) return;
    // Somebody signed in who is simply not CEED goes to their own space rather
    // than to a sign-in form they have already filled in — otherwise the two
    // send each other back and forth.
    navigate(me ? '/me' : '/login', { replace: true });
  }, [loading, staffRole, me, navigate]);

  // Nothing of the workspace is drawn before the server has said who is asking.
  if (loading || !me || !staffRole) return <div className="empty" style={{ padding: 40 }} />;

  const link = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-item on' : 'nav-item');

  return (
    <div className={folded ? 'shell folded' : 'shell'}>
      <nav className="sidebar">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div className="brand-text">
            <div className="brand-name">CEED</div>
            {/* Le centre où l'on travaille : toujours là, et c'est par lui qu'on en change. */}
            <CenterPicker network={network} atGlobal={atGlobal} />
          </div>
        </div>

        {/* On the edge rather than in the list: it is a control over the
            sidebar, not a place to go, and from there it needs no room of its
            own in either state. */}
        <button
          className="fold"
          onClick={() => setFolded(!folded)}
          aria-expanded={!folded}
          aria-label={folded ? 'Open the sidebar' : 'Fold the sidebar'}
          title={folded ? 'Open the sidebar' : 'Fold the sidebar'}
        >
          <Icon name={folded ? 'chevronRight' : 'chevronLeft'} size={13} />
        </button>

        {network?.global && (
          <NavLink to="/network" className={link} title="Global Overview">
            <Icon name="compass" />
            <span className="nav-label">Global Overview</span>
          </NavLink>
        )}
        {/* L'accueil : ma journée, l'équipe, les programmes en cours. */}
        <NavLink to="/" className={link} end title="Home">
          <Icon name="home" />
          <span className="nav-label">Home</span>
        </NavLink>
        {/* Avec le compte de ce qui est en retard : une liste qu'on doit aller
            ouvrir est une liste qu'on oublie. */}
        <NavLink to="/tasks" className={link} title="Tasks">
          <Icon name="check" />
          <span className="nav-label">Tasks</span>
          {late > 0 && <span className="nav-count warn">{late}</span>}
        </NavLink>

        {/* Ce qui l'attend, lui : tâches, rendez-vous, pièces, réponses. */}
        <NavLink to="/notifications" className={link} title="Notifications">
          <Icon name="bell" />
          <span className="nav-label">Notifications</span>
          {unread > 0 && <span className="nav-count">{unread}</span>}
        </NavLink>

        <div className="eyebrow nav-group">Community</div>
        {/* Chaque annuaire montre tout ; chaque rubrique en est la liste sur un rôle. */}
        <DirectoryNav kind="org" to="/organisations" label="Organisations" icon="layers" sections={ORG_SECTIONS} folded={folded} link={link} />
        {/* Les individus : une seule liste, filtrée par la colonne Roles de la grille. */}
        <NavLink to="/individuals" className={link} title="Individuals" onMouseEnter={() => prefetchDirectory('person')} onFocus={() => prefetchDirectory('person')}>
          <Icon name="users" />
          <span className="nav-label">Individuals</span>
        </NavLink>
        {COMMUNITY_LATER.map((item) => (
          <Soon key={item.label} {...item} />
        ))}

        <div className="eyebrow nav-group">Programs</div>
        <NavLink to="/programs" className={link} title="Programs">
          <Icon name="layers" />
          <span className="nav-label">Programs</span>
        </NavLink>
        {/* Ce que les autres centres proposent : ce qui attend une réponse se compte. */}
        {network && network.networkSize > 1 && (
          <NavLink to="/offers" className={link} title="From the network">
            <Icon name="send" />
            <span className="nav-label">From the network</span>
            {network.pendingOffers > 0 && <span className="nav-count">{network.pendingOffers}</span>}
          </NavLink>
        )}
        {PROGRAMS_LATER.map((item) => (
          <Soon key={item.label} {...item} />
        ))}
        <div className="eyebrow nav-group">Team</div>
        <NavLink to="/knowledge" className={link} title="Knowledge Base">
          <Icon name="book" />
          <span className="nav-label">Knowledge Base</span>
        </NavLink>
        <NavLink to="/funding" className={link} title="Funding">
          <Icon name="money" />
          <span className="nav-label">Funding</span>
        </NavLink>
        <NavLink to="/settings" className={link} title="Settings">
          <Icon name="settings" />
          <span className="nav-label">Settings</span>
        </NavLink>

        <div className="sidebar-foot">
          {/* Not workspace navigation — this one is yours, which is why it sits
              with your name rather than under Programs. It appears only for
              somebody actually on a panel, so the sidebar stays the same for
              everybody else. */}
          {onAPanel && (
            <Link
              className="nav-item jury-link"
              to="/me?tab=Jury"
              title={waiting > 0 ? `Jury — ${waiting} waiting on you` : 'Jury'}
            >
              <Icon name="gavel" />
              <span className="nav-label">Jury</span>
              {/* Folded, the count sits on the icon: the one thing in here with
                  a deadline should not be what folding hides. */}
              {waiting > 0 && <span className="nav-count">{waiting}</span>}
            </Link>
          )}

          {/* A cross beside somebody's name reads as "remove them", not as
              "sign out". Who you are leads to Settings, where the account and
              its exit are both filed. */}
          <NavLink to="/settings?tab=account" className="who" title={`${me.record.name} — your account`}>
            <div className="who-text">
              <div className="who-name">{me.record.name}</div>
              <div className="who-role">{STAFF_ROLE_LABEL[staffRole]}</div>
            </div>
            <Icon name="settings" size={13} />
          </NavLink>

          <div className="seg" role="group" aria-label="Theme">
            <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')} title="Light">
              <Icon name="sun" size={13} />
            </button>
            {/* The word does not fit a folded rail; the split disc says the
                same thing in the space of the two icons beside it. */}
            <button className={theme === 'system' ? 'on' : ''} onClick={() => setTheme('system')} title="System">
              {folded ? <Icon name="contrast" size={13} /> : 'Auto'}
            </button>
            <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')} title="Dark">
              <Icon name="moon" size={13} />
            </button>
          </div>
        </div>
      </nav>

      <div className="main">
        {/* Qui peut changer de centre voit toujours dans lequel il est : une
            décision prise dans le mauvais centre est la pire erreur possible ici. */}
        {network && (network.global || network.centers.length > 1) && (
          <div className={atGlobal ? 'center-strip global' : 'center-strip'}>
            {atGlobal ? (
              <span>
                <b>CEED Global</b> — the whole network
              </span>
            ) : (
              <span>
                Working in <b>{currentName(network)}</b>
              </span>
            )}
            {network.global && !atGlobal && (
              <Link to="/network" className="center-strip-link">
                Global Overview
              </Link>
            )}
          </div>
        )}
        {/* La page se charge à part : le cadre reste, sans clignoter. */}
        <Suspense fallback={<div className="empty" style={{ padding: 40 }} />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}

const currentName = (network: NetworkMe) => network.centers.find((c) => c.id === network.current)?.name ?? 'CEED';

/**
 * Le centre où l'on travaille, sous le nom de CEED. Qui n'en a qu'un le lit ;
 * qui en a plusieurs — ou CEED Global — l'ouvre pour en changer.
 */
function CenterPicker({ network, atGlobal }: { network: NetworkMe | null; atGlobal: boolean }) {
  if (!network) return <div className="brand-sub">Program Management</div>;
  const here = atGlobal ? 'CEED Global' : currentName(network);
  if (!network.global && network.centers.length < 2) return <div className="brand-sub">{here}</div>;
  return (
    <PopCard
      className="brand-sub center-pick"
      label={
        <>
          {here} <Icon name="chevronDown" size={11} />
        </>
      }
      card={(close) => (
        <div className="stack" style={{ gap: 2 }}>
          <span className="eyebrow" style={{ padding: '2px 8px 6px' }}>Work in</span>
          {network.global && (
            <Link to="/network" className={atGlobal ? 'center-option on' : 'center-option'} onClick={close}>
              <Icon name="compass" size={14} /> Global Overview
            </Link>
          )}
          {network.centers.map((c) => (
            <button
              key={c.id}
              className={!atGlobal && c.id === network.current ? 'center-option on' : 'center-option'}
              onClick={() => (c.id === network.current && !atGlobal ? close() : enterCenter(c.id))}
            >
              <span style={{ flex: 1 }}>{c.name}</span>
              {c.status === 'inactive' && <span className="badge">Inactive</span>}
              {c.country && <span className="faint" style={{ fontSize: 12 }}>{c.country}</span>}
            </button>
          ))}
        </div>
      )}
    />
  );
}

function Soon({ label, icon }: { label: string; icon: string }) {
  return (
    <span className="nav-item" aria-disabled="true" title={`${label} — not built yet`}>
      <Icon name={icon} />
      <span className="nav-label">{label}</span>
    </span>
  );
}

/**
 * Un annuaire dans la barre latérale : son lien, qui montre tout, et ses
 * rubriques en dessous — repliables, et on s'en souvient dans ce navigateur.
 */
function DirectoryNav({
  kind,
  to,
  label,
  icon,
  sections,
  folded,
  link,
}: {
  kind: 'org' | 'person';
  to: string;
  label: string;
  icon: 'layers' | 'users';
  sections: readonly { label: string; role: string }[];
  folded: boolean;
  link: (p: { isActive: boolean }) => string;
}) {
  const where = useLocation();
  const key = `nav-${kind}-open`;
  const [open, setOpenState] = useState(() => {
    try {
      return localStorage.getItem(key) !== 'no';
    } catch {
      return true;
    }
  });
  const setOpen = (v: boolean) => {
    setOpenState(v);
    try {
      localStorage.setItem(key, v ? 'yes' : 'no');
    } catch {
      /* rien à garder */
    }
  };
  const warm = () => prefetchDirectory(kind);
  const here = where.pathname === to ? new URLSearchParams(where.search).get('role') : null;
  return (
    <>
      <div className="nav-row">
        <NavLink to={to} className={link} title={label} onMouseEnter={warm} onFocus={warm}>
          <Icon name={icon} />
          <span className="nav-label">{label}</span>
        </NavLink>
        {!folded && (
          <button
            className="nav-toggle"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? `Fold the ${label.toLowerCase()} types` : `Show the ${label.toLowerCase()} types`}
            title={open ? 'Fold' : 'Show the types'}
          >
            <Icon name={open ? 'chevronUp' : 'chevronDown'} size={13} />
          </button>
        )}
      </div>
      {!folded && open && (
        <div className="nav-sub">
          {sections.map((s) => (
            <Link key={s.role} onMouseEnter={warm} to={`${to}?role=${encodeURIComponent(s.role)}`} className={here === s.role ? 'on' : ''}>
              {s.label}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
