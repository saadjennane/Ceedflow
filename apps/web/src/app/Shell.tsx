import { STAFF_ROLE_LABEL } from '@ceed/shared';
import { useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAccount } from '../lib/account';
import { api } from '../lib/api';
import { stillWaiting } from '../lib/panels';
import { useAsync } from '../lib/useAsync';
import type { ReviewPanel } from '../pages/member/ReviewPage';
import { Icon } from '../ui/Icon';
import { useTheme } from '../ui/Overlays';

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

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div>
            <div className="brand-name">CEED</div>
            <div className="brand-sub">Program Management</div>
          </div>
        </div>

        {TOP.map((item) => (
          <Soon key={item.label} {...item} />
        ))}

        <div className="eyebrow nav-group">Community</div>
        <NavLink to="/organisations" className={({ isActive }) => (isActive ? 'nav-item on' : 'nav-item')}>
          <Icon name="layers" />
          Organisations
        </NavLink>
        <NavLink to="/individuals" className={({ isActive }) => (isActive ? 'nav-item on' : 'nav-item')}>
          <Icon name="users" />
          Individuals
        </NavLink>
        {COMMUNITY_LATER.map((item) => (
          <Soon key={item.label} {...item} />
        ))}

        <div className="eyebrow nav-group">Programs</div>
        <NavLink to="/" className={({ isActive }) => (isActive ? 'nav-item on' : 'nav-item')} end>
          <Icon name="layers" />
          Programs
        </NavLink>
        {PROGRAMS_LATER.map((item) => (
          <Soon key={item.label} {...item} />
        ))}
        <NavLink to="/settings" className={({ isActive }) => (isActive ? 'nav-item on' : 'nav-item')}>
          <Icon name="settings" />
          Settings
        </NavLink>

        <div className="sidebar-foot">
          {/* Not workspace navigation — this one is yours, which is why it sits
              with your name rather than under Programs. It appears only for
              somebody actually on a panel, so the sidebar stays the same for
              everybody else. */}
          {onAPanel && (
            <Link className="nav-item" to="/me?tab=Jury" style={{ marginBottom: 4 }}>
              <Icon name="gavel" />
              <span style={{ flex: 1 }}>Jury</span>
              {waiting > 0 && <span className="nav-count">{waiting}</span>}
            </Link>
          )}

          {/* A cross beside somebody's name reads as "remove them", not as
              "sign out". Who you are leads to Settings, where the account and
              its exit are both filed. */}
          <NavLink to="/settings" className="who" title="Your account">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="who-name">{me.record.name}</div>
              <div className="who-role">{STAFF_ROLE_LABEL[staffRole]}</div>
            </div>
            <Icon name="settings" size={13} />
          </NavLink>

          <div className="seg" role="group" aria-label="Theme">
            <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')} title="Light">
              <Icon name="sun" size={13} />
            </button>
            <button className={theme === 'system' ? 'on' : ''} onClick={() => setTheme('system')} title="System">
              Auto
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
    <span className="nav-item" aria-disabled="true" title="Not built yet">
      <Icon name={icon} />
      {label}
    </span>
  );
}
