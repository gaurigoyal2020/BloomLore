import { useEffect, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  Upload, LayoutDashboard, FolderOpen,
  Captions, Settings, CreditCard, LogOut
} from 'lucide-react';
import Mascot from './Mascot';
import { getLessons } from './api';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard',    to: '/'          },
  { icon: FolderOpen,      label: 'Your Activity', to: '/activity'  },
  { icon: Upload,          label: 'Uploads',      to: '/upload'    },
  { icon: Captions,        label: 'Subtitles',    to: '/subtitles' },
  { icon: CreditCard,      label: 'My Plan',      to: '/plan'      },
  { icon: Settings,        label: 'Settings',     to: '/settings'  },
];

const Sidebar = ({ mascotState, userEmail, onLogout, session }) => {
  // Real count of currently-active uploads — used just as a lightweight
  // "you're using this" signal in the footer. Not tied to a quota bar
  // any more since the real Free/Pro limits are minute-based (see
  // PlanPage), and the backend doesn't track transcription minutes yet.
  const [used, setUsed] = useState(null);

  useEffect(() => {
    if (!session?.access_token) { setUsed(null); return; }
    let cancelled = false;

    getLessons(session.access_token)
      .then((data) => { if (!cancelled) setUsed(data.length); })
      .catch(() => { if (!cancelled) setUsed(null); });

    return () => { cancelled = true; };
  }, [session?.access_token]);

  return (
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
        // "end" only on Dashboard's "/" so it doesn't stay highlighted
        // once you've navigated to a nested route like /activity/:id.
        <NavLink
          key={label}
          to={to}
          end={to === '/'}
          className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}
        >
          <Icon size={18} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
    <div className="sidebar-footer">
      {session ? (
        <>
          {userEmail && (
            <div className="sidebar-account">
              <span className="sidebar-account-email" title={userEmail}>{userEmail}</span>
              <button className="sidebar-logout" onClick={onLogout} title="Log out">
                <LogOut size={15} />
              </button>
            </div>
          )}
          <Link to="/plan" className="plan-label" style={{ textDecoration: 'none' }}>Free Plan</Link>
          <div className="plan-sub">
            {used === null ? 'Loading usage…' : `${used} active upload${used === 1 ? '' : 's'}`}
          </div>
          <Link to="/plan" className="btn-upgrade" style={{ textDecoration: 'none', textAlign: 'center', display: 'block' }}>
            View Plans
          </Link>
        </>
      ) : (
        <>
          <div className="plan-sub" style={{ marginBottom: 8 }}>
            Sign in to upload and translate videos
          </div>
          <Link to="/login" className="btn-upgrade" style={{ textDecoration: 'none', textAlign: 'center', display: 'block' }}>
            Sign In
          </Link>
        </>
      )}
    </div>
  </aside>
  );
};

export default Sidebar;