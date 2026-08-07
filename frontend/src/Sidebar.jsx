import { NavLink } from 'react-router-dom';
import {
  Upload, LayoutDashboard, FolderOpen,
  Captions, Settings, CreditCard, LogOut
} from 'lucide-react';
import Mascot from './Mascot';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', to: '/dashboard' },
  { icon: FolderOpen,      label: 'Projects',  to: '/projects'  },
  { icon: Upload,          label: 'Uploads',   to: '/upload'    },
  { icon: Captions,        label: 'Subtitles', to: '/subtitles' },
  { icon: CreditCard,      label: 'My Plan',   to: '/plan'      },
  { icon: Settings,        label: 'Settings',  to: '/settings'  },
];

const Sidebar = ({ mascotState, userEmail, onLogout }) => (
  <aside className="sidebar">
    <div className="sidebar-logo">
      <Mascot size={32} state={mascotState} />
      <span className="logo-text">BloomLore</span>
    </div>
    <nav className="sidebar-nav">
      {navItems.map(({ icon: Icon, label, to }) => (
        // NavLink instead of a plain <div>: 'active' used to be
        // hardcoded to whichever page happened to be written directly
        // into App.jsx (always "Uploads", regardless of where you
        // actually were). isActive here is derived from the real
        // current URL, so it's correct no matter which page you're on.
        <NavLink
          key={label}
          to={to}
          className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}
        >
          <Icon size={18} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
    {/* Free Plan / Upgrade block below is still decorative/fake (item #5
        from the handoff doc) — deliberately left alone. Only the account
        row above it is real, since that's what auth actually needed. */}
    <div className="sidebar-footer">
      {userEmail && (
        <div className="sidebar-account">
          <span className="sidebar-account-email" title={userEmail}>{userEmail}</span>
          <button className="sidebar-logout" onClick={onLogout} title="Log out">
            <LogOut size={15} />
          </button>
        </div>
      )}
      <div className="plan-label">Free Plan</div>
      <div className="plan-sub">2 of 5 uploads used</div>
      <div className="plan-bar">
        <div className="plan-bar-fill" style={{ width: '40%' }} />
      </div>
      <button className="btn-upgrade">Upgrade Plan</button>
    </div>
  </aside>
);

export default Sidebar;