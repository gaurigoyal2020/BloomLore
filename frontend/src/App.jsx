import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import Mascot from './Mascot';
import Auth from './Auth';
import Layout from './Layout';
import UploadsPage from './UploadsPage';
import ActivityPage from './ActivityPage';
import LessonDetailPage from './LessonDetailPage';
import DashboardPage from './DashboardPage';
import PlanPage from './PlanPage';
import SettingsPage from './SettingsPage';
import { supabase } from './supabaseClient';
import './index.css';

/**
 * Gate for routes that need a real session (Upload, Activity, Plan, etc).
 * Dashboard itself is NOT behind this — it's the one page that has to
 * render for a logged-out visitor too, so it reads `session` from the
 * outlet context and branches internally instead of being redirected
 * away before it ever gets a chance to render.
 *
 * IMPORTANT: this renders its own <Outlet>, which is a NEW outlet as
 * far as useOutletContext() is concerned — it does NOT automatically
 * inherit the {session, setMascotState} that Layout's <Outlet> passed
 * down. Every page below (Upload/Activity/Plan/etc.) calls
 * useOutletContext() expecting that value, so we have to read it here
 * and hand it through explicitly via <Outlet context={...} />, or
 * those pages get `undefined` and crash trying to destructure it.
 */
function RequireAuth() {
  const location = useLocation();
  const outletContext = useOutletContext();
  const { session } = outletContext ?? {};
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet context={outletContext} />;
}

/**
 * App.jsx is now just two things: the auth gate, and the route map.
 * All the actual page logic (upload flow, history, etc.) lives in its
 * own file per page — this file doesn't know or care what any of them
 * do internally, same separation Layout.jsx/Sidebar.jsx already use.
 */
function App() {
  const [session, setSession] = useState(undefined); // undefined = still checking, null = logged out
  // Lives here (not inside UploadsPage) because Sidebar/Layout also
  // need to read it, and Sidebar is a sibling of whichever page is
  // active, not a parent — pages update it via the setter passed down
  // through outlet context, Layout reads the value directly as a prop.
  const [mascotState, setMascotState] = useState('idle');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const handleLogout = () => {
    supabase.auth.signOut();
    // Individual pages own their own state (file/result/etc) now, so
    // there's nothing left for App.jsx itself to reset on logout —
    // each page component unmounts/remounts naturally via routing.
  };

  // Still checking for an existing session on first load.
  if (session === undefined) {
    return <div className="app-loading"><Mascot size={48} state="idle" /></div>;
  }

  return (
    <Routes>
      {/* Full-screen, outside the Sidebar shell — logging in/out of the
          app chrome mid-form would be jarring, and a logged-in visitor
          has no reason to be here anyway. */}
      <Route path="login" element={session ? <Navigate to="/" replace /> : <Auth />} />

      <Route
        element={
          <Layout
            session={session}
            mascotState={mascotState}
            setMascotState={setMascotState}
            userEmail={session?.user?.email}
            onLogout={handleLogout}
          />
        }
      >
        {/* The default page, logged in or not — DashboardPage itself
            decides what "logged in vs out" looks like. */}
        <Route index element={<DashboardPage />} />

        {/* Dashboard, Plan, and Settings are the three pages a logged-out
            visitor is allowed to see (see Sidebar's nav filtering) — so
            none of these three live behind RequireAuth. Plan and
            Settings both branch internally on session === null instead
            of redirecting away. */}
        <Route path="plan" element={<PlanPage />} />
        <Route path="settings" element={<SettingsPage />} />

        <Route element={<RequireAuth />}>
          <Route path="upload" element={<UploadsPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="activity/:id" element={<LessonDetailPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;