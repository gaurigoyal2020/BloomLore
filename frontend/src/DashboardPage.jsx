import { useEffect, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { AlertCircle, Clock, Sparkles, Upload, Languages, ShieldCheck } from 'lucide-react';
import Mascot from './Mascot';
import { getLessons } from './api';

const LANG_NAME = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', hi: 'Hindi',
  zh: 'Chinese', ja: 'Japanese', ko: 'Korean', pt: 'Portuguese',
  ru: 'Russian', ar: 'Arabic', it: 'Italian',
};

/** "3h left" / "42m left" — how long until this lesson auto-deletes. */
function timeLeftLabel(expiresAt) {
  const msLeft = new Date(expiresAt).getTime() - Date.now();
  if (msLeft <= 0) return 'Expired';
  const hours = Math.floor(msLeft / 3_600_000);
  if (hours >= 1) return `${hours}h left`;
  const minutes = Math.max(1, Math.floor(msLeft / 60_000));
  return `${minutes}m left`;
}

/** Logged-out view — no session, so no fetch, no lesson data of any kind. */
function PublicDashboard() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Welcome to BloomLore
            <span className="title-icon" aria-hidden="true"> 🌸</span>
          </h1>
          <p className="page-sub">Auto-translated, clean subtitles for your videos — in minutes.</p>
        </div>
        <Mascot size={56} state="idle" className="header-mascot" />
      </div>

      <div className="settings-card" style={{ maxWidth: 480 }}>
        <p className="field-hint" style={{ display: 'block', marginBottom: '1rem' }}>
          Sign in to upload a video, transcribe it, and export clean SRT/VTT
          subtitles — translated into whatever language you need.
        </p>
        <Link
          to="/login"
          className="btn-generate"
          style={{ width: 'auto', display: 'inline-flex', textDecoration: 'none', padding: '0.65rem 1.4rem' }}
        >
          Sign in to get started
        </Link>
      </div>

      <h2 className="features-title" style={{ marginTop: '1.75rem' }}>What you get on the Free plan</h2>
      <div className="plan-tiers" style={{ marginTop: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="plan-tier-card">
          <div className="plan-tier-head">
            <span className="plan-tier-name"><Upload size={15} style={{ verticalAlign: -2, marginRight: 6 }} />30 min/month</span>
          </div>
          <p className="field-hint" style={{ display: 'block' }}>Free transcription minutes, reset every month.</p>
        </div>
        <div className="plan-tier-card">
          <div className="plan-tier-head">
            <span className="plan-tier-name"><Languages size={15} style={{ verticalAlign: -2, marginRight: 6 }} />No watermark</span>
          </div>
          <p className="field-hint" style={{ display: 'block' }}>Clean SRT/VTT exports — even on the free tier.</p>
        </div>
        <div className="plan-tier-card">
          <div className="plan-tier-head">
            <span className="plan-tier-name"><ShieldCheck size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Private by default</span>
          </div>
          <p className="field-hint" style={{ display: 'block' }}>Videos auto-delete 24 hours after upload.</p>
        </div>
      </div>
    </>
  );
}

/** Logged-in view — real numbers from /api/lessons, no mocking. */
function PrivateDashboard({ session }) {
  const [lessons, setLessons] = useState(null); // null = still loading
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    getLessons(session.access_token)
      .then((data) => { if (!cancelled) setLessons(data); })
      .catch((err) => { if (!cancelled) setError(err.message); });

    return () => { cancelled = true; };
  }, [session.access_token]);

  // Lessons auto-delete 24h after upload (see ActivityPage), so these
  // figures reflect what's currently active, not a lifetime total.
  const totalUploads = lessons?.length ?? 0;
  const totalWords = lessons?.reduce((sum, l) => sum + (l.word_count ?? 0), 0) ?? 0;
  const languagesUsed = lessons
    ? new Set(lessons.filter((l) => l.target_lang !== l.original_lang).map((l) => l.target_lang)).size
    : 0;
  const nextExpiry = lessons?.length
    ? lessons.reduce((soonest, l) =>
        new Date(l.expires_at) < new Date(soonest.expires_at) ? l : soonest
      )
    : null;

  const recent = lessons?.slice(0, 5) ?? [];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Dashboard
            <span className="title-icon" aria-hidden="true"> 📊</span>
          </h1>
          <p className="page-sub">A quick look at what&rsquo;s blooming right now</p>
        </div>
        <Mascot size={56} state="idle" className="header-mascot" />
      </div>

      {error && (
        <div className="alert-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {lessons === null && !error && (
        <p className="field-hint">Loading your dashboard…</p>
      )}

      {lessons?.length === 0 && (
        <div className="settings-card" style={{ textAlign: 'center', maxWidth: 420 }}>
          <Sparkles size={32} style={{ opacity: 0.5 }} />
          <p className="field-hint" style={{ display: 'block', margin: '0.75rem 0 1rem' }}>
            Nothing here yet — upload a video to see your stats fill in.
          </p>
          <Link
            to="/upload"
            className="btn-generate"
            style={{ width: 'auto', display: 'inline-flex', textDecoration: 'none', padding: '0.65rem 1.4rem' }}
          >
            Upload a video
          </Link>
        </div>
      )}

      {lessons?.length > 0 && (
        <>
          <div className="stats-card">
            <div className="stat-item">
              <span className="stat-label">Active Uploads</span>
              <span className="stat-value">{totalUploads}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Words Transcribed</span>
              <span className="stat-value">{totalWords.toLocaleString()}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Languages Used</span>
              <span className="stat-value">{languagesUsed}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Next Expiry</span>
              <span className="stat-value--small">
                {nextExpiry ? timeLeftLabel(nextExpiry.expires_at) : '—'}
              </span>
            </div>
          </div>

          <div className="section-head" style={{ marginTop: '1.75rem' }}>
            <h2 className="features-title">Recent Activity</h2>
            <Link to="/activity" className="link-view-all">View all →</Link>
          </div>

          <div className="projects-list" style={{ marginTop: '0.75rem' }}>
            {recent.map((lesson) => (
              <Link key={lesson.id} to={`/activity/${lesson.id}`} className="project-row">
                <div className="project-row-main">
                  <span className="project-row-name">{lesson.original_filename ?? 'Untitled video'}</span>
                  <span className="project-row-meta">
                    {LANG_NAME[lesson.original_lang] ?? lesson.original_lang}
                    {lesson.target_lang !== lesson.original_lang &&
                      ` → ${LANG_NAME[lesson.target_lang] ?? lesson.target_lang}`}
                    {' · '}{lesson.word_count} words
                  </span>
                </div>
                <span className="project-row-expiry">
                  <Clock size={13} /> {timeLeftLabel(lesson.expires_at)}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/**
 * The app's index route ("/") — deliberately does NOT sit behind
 * RequireAuth in App.jsx, so it has to work with session === null. It
 * reads session from outlet context (never a lessonId — this page has
 * no per-lesson concept at all) and just picks which sub-view to show.
 */
function DashboardPage() {
  const { session } = useOutletContext();
  return session ? <PrivateDashboard session={session} /> : <PublicDashboard />;
}

export default DashboardPage;