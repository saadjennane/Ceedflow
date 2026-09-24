import { STAFF_ROLE_LABEL } from '@ceed/shared';
import { useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAccount } from '../lib/account';
import { api } from '../lib/api';
import { stillWaiting } from '../lib/panels';
import { useAsync } from '../lib/useAsync';
import type { ReviewPanel } from '../pages/member/ReviewPage';
import { Icon } from '../ui/Icon';
import { useSidebar, useTheme } from '../ui/Overlays';

/**
 * The navigation the prototype settled on. Sections that exist in the model but
 * are not built yet stay visible and inert, so the shape of the product is legible.
 */
const TOP = [
  { label: 'Home', icon: 'home' },
  { label: 'Tasks', icon: 'check' },
];

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
            <div className="brand-sub">Program Management</div>
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

        {TOP.map((item) => (
          <Soon key={item.label} {...item} />
        ))}

        <div className="eyebrow nav-group">Community</div>
        <NavLink to="/organisations" className={link} title="Organisations">
          <Icon name="layers" />
          <span className="nav-label">Organisations</span>
        </NavLink>
        <NavLink to="/individuals" className={link} title="Individuals">
          <Icon name="users" />
          <span className="nav-label">Individuals</span>
        </NavLink>
        {COMMUNITY_LATER.map((item) => (
          <Soon key={item.label} {...item} />
        ))}

        <div className="eyebrow nav-group">Programs</div>
        <NavLink to="/" className={link} end title="Programs">
          <Icon name="layers" />
          <span className="nav-label">Programs</span>
        </NavLink>
        {PROGRAMS_LATER.map((item) => (
          <Soon key={item.label} {...item} />
        ))}
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
          <NavLink to="/settings" className="who" title={`${me.record.name} — your account`}>
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
        <Outlet />
      </div>
    </div>
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
