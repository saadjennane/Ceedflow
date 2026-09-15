import { NavLink, Outlet } from 'react-router-dom';
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

const COMMUNITY = [
  { label: 'Organisations', icon: 'layers' },
  { label: 'Individuals', icon: 'users' },
  { label: 'CRM', icon: 'compass' },
  { label: 'Campaigns', icon: 'send' },
];

const PROGRAMS_LATER = [
  { label: 'Calendar', icon: 'calendar' },
  { label: 'Reports', icon: 'grid' },
  { label: 'Settings', icon: 'settings' },
];

export function Shell() {
  const [theme, setTheme] = useTheme();

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
        {COMMUNITY.map((item) => (
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

        <div className="sidebar-foot">
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
