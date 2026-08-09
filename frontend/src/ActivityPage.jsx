import { useEffect, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { Languages, FileText, Clock, AlertCircle } from 'lucide-react';
import Mascot from './Mascot';
import { getLessons } from './api';
import './ActivityPage.css';

const LANG_NAME = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', hi: 'Hindi',
  zh: 'Chinese', ja: 'Japanese', ko: 'Korean', pt: 'Portuguese',
  ru: 'Russian', ar: 'Arabic', it: 'Italian',
};

// Same flag set ResultsPage uses (FLAG const there), plus en/it so this
// page has full coverage of every language the app supports.
const FLAG = {
  en: '🇺🇸', ja: '🇯🇵', ko: '🇰🇷', es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪',
  zh: '🇨🇳', hi: '🇮🇳', pt: '🇧🇷', ru: '🇷🇺', ar: '🇸🇦', it: '🇮🇹',
};

/** "3h left" / "42m left" — how long until this lesson auto-deletes. */
function timeLeft(expiresAt) {
  const msLeft = new Date(expiresAt).getTime() - Date.now();
  if (msLeft <= 0) return { label: 'Expired', level: 'urgent' };
  const hours = Math.floor(msLeft / 3_600_000);
  if (hours >= 2) return { label: `${hours}h left`, level: 'ok' };
  if (hours >= 1) return { label: `${hours}h left`, level: 'warn' };
  const minutes = Math.max(1, Math.floor(msLeft / 60_000));
  return { label: `${minutes}m left`, level: 'urgent' };
}

function ActivityPage() {
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
            Your Activity
            <span className="title-icon" aria-hidden="true"> 📁</span>
            {lessons?.length > 0 && (
              <span className="activity-count-pill">{lessons.length} active</span>
            )}
          </h1>
          <p className="page-sub">Everything you&rsquo;ve uploaded — auto-deletes 24 hours after upload</p>
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
        <div className="settings-card activity-empty">
          <div className="activity-empty-glyphs" aria-hidden="true">🌸 🎬 🌸</div>
          <p className="field-hint" style={{ display: 'block' }}>
            No activity yet — head to Uploads to generate your first subtitles.
          </p>
        </div>
      )}

      {lessons?.length > 0 && (
        <div className="activity-list">
          {lessons.map((lesson) => {
            const expiry = timeLeft(lesson.expires_at);
            const fromFlag = FLAG[lesson.original_lang] ?? '🌍';
            const toFlag = FLAG[lesson.target_lang] ?? '🌍';
            return (
              <Link key={lesson.id} to={`/activity/${lesson.id}`} className="activity-row">
                <div className="activity-row-icon">
                  <Languages size={19} />
                </div>

                <div className="activity-row-main">
                  <span className="activity-row-name">{lesson.original_filename ?? 'Untitled video'}</span>
                  <span className="activity-row-meta">
                    <span className="activity-lang-pair">
                      {fromFlag} {LANG_NAME[lesson.original_lang] ?? lesson.original_lang}
                      {lesson.target_lang !== lesson.original_lang && (
                        <> → {toFlag} {LANG_NAME[lesson.target_lang] ?? lesson.target_lang}</>
                      )}
                    </span>
                    <span className="activity-meta-dot">·</span>
                    <span className="activity-meta-item">
                      <FileText size={12} /> {lesson.word_count} words
                    </span>
                  </span>
                </div>

                <span className={`activity-row-badge activity-row-badge--${expiry.level}`}>
                  <Clock size={12} /> {expiry.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

export default ActivityPage;