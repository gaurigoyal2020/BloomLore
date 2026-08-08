import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import Mascot from './Mascot';
import Auth from './Auth';
import Layout from './Layout';
import UploadsPage from './UploadsPage';
import ActivityPage from './ActivityPage';
import LessonDetailPage from './LessonDetailPage';
import DashboardPage from './DashboardPage';
import PlanPage from './PlanPage';
import ComingSoonPage from './ComingSoonPage';
import { supabase } from './supabaseClient';
import './index.css';

/**
 * Gate for routes that need a real session (Upload, Activity, Plan, etc).
 * Dashboard itself is NOT behind this — it's the one page that has to
 * render for a logged-out visitor too, so it reads `session` from the
 * outlet context and branches internally instead of being redirected
 * away before it ever gets a chance to render.
 */
function RequireAuth({ session }) {
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
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

        <Route element={<RequireAuth session={session} />}>
          <Route path="upload" element={<UploadsPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="activity/:id" element={<LessonDetailPage />} />
          <Route path="plan" element={<PlanPage />} />
          <Route
            path="subtitles"
            element={
              <ComingSoonPage
                title="Subtitles"
                description="Search and browse subtitles across all your videos — coming soon."
              />
            }
          />
          <Route
            path="settings"
            element={
              <ComingSoonPage
                title="Settings"
                description="Account settings are coming soon."
              />
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;