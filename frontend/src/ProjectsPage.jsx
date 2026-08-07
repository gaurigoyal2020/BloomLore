import { useEffect, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { FolderOpen, Clock, AlertCircle } from 'lucide-react';
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

function ProjectsPage() {
  const { session } = useOutletContext();
  const [lessons, setLessons] = useState(null); // null = still loading
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    getLessons(session.access_token)
      .then((data) => { if (!cancelled) setLessons(data); })
      .catch((err) => { if (!cancelled) setError(err.message); });

    // Avoids setting state on an unmounted component if the user
    // navigates away before the fetch resolves.
    return () => { cancelled = true; };
  }, [session.access_token]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Your Uploads
            <span className="title-icon" aria-hidden="true"> 📁</span>
          </h1>
          <p className="page-sub">Videos auto-delete 24 hours after upload</p>
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
        <p className="field-hint">Loading your uploads…</p>
      )}

      {lessons?.length === 0 && (
        <div className="settings-card" style={{ textAlign: 'center', maxWidth: 420 }}>
          <FolderOpen size={32} style={{ opacity: 0.5 }} />
          <p className="field-hint" style={{ display: 'block', marginTop: '0.75rem' }}>
            No uploads yet — head to Uploads to generate your first subtitles.
          </p>
        </div>
      )}

      {lessons?.length > 0 && (
        <div className="projects-list">
          {lessons.map((lesson) => (
            <Link key={lesson.id} to={`/projects/${lesson.id}`} className="project-row">
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
      )}
    </>
  );
}

export default ProjectsPage;