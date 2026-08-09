import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

/**
 * The shared shell every page renders inside: sidebar on the left,
 * current page's content on the right via <Outlet />. Rendered for both
 * logged-in and logged-out visitors now (Dashboard needs to work for
 * both) — `session` may be null here, and Sidebar/pages downstream are
 * expected to handle that themselves rather than assume it's always set.
 */
const Layout = ({ session, mascotState, setMascotState, userEmail, onLogout }) => (
  <div className="app-layout">
    <Sidebar mascotState={mascotState} userEmail={userEmail} onLogout={onLogout} session={session} />
    <main className="main-content">
      <Outlet context={{ session, setMascotState, onLogout }} />
    </main>
  </div>
);

export default Layout;