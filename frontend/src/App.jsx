import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Mascot from './Mascot';
import Auth from './Auth';
import Layout from './Layout';
import UploadsPage from './UploadsPage';
import ProjectsPage from './ProjectsPage';
import LessonDetailPage from './LessonDetailPage';
import ComingSoonPage from './ComingSoonPage';
import { supabase } from './supabaseClient';
import './index.css';

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

  // No session — show login/signup instead of the app, regardless of
  // which URL was requested.
  if (session === null) {
    return <Auth />;
  }

  return (
    <Routes>
      <Route
        element={
          <Layout
            session={session}
            mascotState={mascotState}
            setMascotState={setMascotState}
            userEmail={session.user?.email}
            onLogout={handleLogout}
          />
        }
      >
        <Route index element={<Navigate to="/upload" replace />} />
        <Route path="upload" element={<UploadsPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<LessonDetailPage />} />
        <Route
          path="dashboard"
          element={
            <ComingSoonPage
              title="Dashboard"
              description="An overview of your recent activity is coming soon."
            />
          }
        />
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
          path="plan"
          element={
            <ComingSoonPage
              title="My Plan"
              description="Real usage stats and plan management are coming soon."
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
        <Route path="*" element={<Navigate to="/upload" replace />} />
      </Route>
    </Routes>
  );
}

export default App;