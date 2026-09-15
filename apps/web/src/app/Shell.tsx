import { NavLink, Outlet } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { useTheme } from '../ui/Overlays';

/** Sections that exist in the model but are not built yet stay visible and inert. */
const LATER = [
  { label: 'Home', icon: 'home' },
  { label: 'Tasks', icon: 'check' },
  { label: 'Organisations', icon: 'layers' },
  { label: 'Individuals', icon: 'users' },
  { label: 'Campaigns', icon: 'send' },
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
          <div className="brand-name">CEED</div>
        </div>

        <div className="eyebrow nav-group">Programmes</div>
        <NavLink to="/" className={({ isActive }) => (isActive ? 'nav-item on' : 'nav-item')} end>
          <Icon name="layers" />
          Programmes
        </NavLink>

        <div className="eyebrow nav-group">Coming next</div>
        {LATER.map((item) => (
          <span className="nav-item" aria-disabled="true" key={item.label} title="Not built yet">
            <Icon name={item.icon} />
            {item.label}
          </span>
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
