import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

/**
 * The shared shell every logged-in page renders inside: sidebar on the
 * left, current page's content on the right via <Outlet />. This
 * replaces the old setup where App.jsx directly decided what to show in
 * `main.content` — now each nav item is a real route, and this is just
 * the frame around whichever one is active.
 */
const Layout = ({ session, mascotState, setMascotState, userEmail, onLogout }) => (
  <div className="app-layout">
    <Sidebar mascotState={mascotState} userEmail={userEmail} onLogout={onLogout} />
    <main className="main-content">
      <Outlet context={{ session, setMascotState }} />
    </main>
  </div>
);

export default Layout;