import { useEffect, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import {
  AlertCircle, Clock, Search, Globe, Sparkles, ShieldCheck, Zap,
} from 'lucide-react';
import Mascot from './Mascot';
import { getLessons } from './api';
import heroScene from './assets/hero-scene.webp';
import './DashboardPage.css';

const LANG_NAME = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', hi: 'Hindi',
  zh: 'Chinese', ja: 'Japanese', ko: 'Korean', pt: 'Portuguese',
  ru: 'Russian', ar: 'Arabic', it: 'Italian',
};
const FLAG = {
  en: '🇺🇸', ja: '🇯🇵', ko: '🇰🇷', es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪',
  zh: '🇨🇳', hi: '🇮🇳', pt: '🇧🇷', ru: '🇷🇺', ar: '🇸🇦', it: '🇮🇹',
};
// The real number of languages the app supports (see UploadsPage's own
// `languages` list) — the design inspiration said "100+", but that's
// not true for this product yet, so this page says 12 instead.
const SUPPORTED_LANGUAGE_COUNT = 12;

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
      <div className="dash-hero">
        <div>
          <h1 className="dash-hero-heading">
            Make <span className="accent">every word</span> understood, everywhere.
          </h1>
          <p className="dash-hero-sub">
            BloomLore uses AI to generate accurate subtitles and translate
            them into {SUPPORTED_LANGUAGE_COUNT} languages — upload a video
            and get clean, exportable subtitles back in minutes.
          </p>
          <div className="dash-cta-row">
            <Link to="/login" className="btn-generate" style={{ width: 'auto', textDecoration: 'none' }}>
              Get Started Free
            </Link>
            <Link to="/plan" className="btn-outline">View Plans</Link>
          </div>
        </div>
        <div className="dash-hero-art">
          <img src={heroScene} alt="A cozy pixel-art room at night, BloomLore playing on screen" />
        </div>
      </div>

      <div className="dash-feature-grid">
        <div className="dash-feature-card">
          <div className="dash-feature-icon"><Zap size={19} /></div>
          <span className="dash-feature-title">AI-Powered Accuracy</span>
          <span className="dash-feature-desc">Deepgram-backed transcription tuned for clean, accurate subtitles.</span>
        </div>
        <div className="dash-feature-card">
          <div className="dash-feature-icon"><Globe size={19} /></div>
          <span className="dash-feature-title">{SUPPORTED_LANGUAGE_COUNT} Languages</span>
          <span className="dash-feature-desc">Translate your subtitles into the language your audience actually speaks.</span>
        </div>
        <div className="dash-feature-card">
          <div className="dash-feature-icon"><ShieldCheck size={19} /></div>
          <span className="dash-feature-title">Secure &amp; Private</span>
          <span className="dash-feature-desc">Videos auto-delete 24 hours after upload — nothing lingers on our servers.</span>
        </div>
      </div>
    </>
  );
}

/** Deterministic pseudo-scatter for the bloom garden — avoids Math.random()
    re-jittering positions on every re-render (e.g. while typing in search). */
function seededPercent(seed, salt) {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** "Your Bloom" garden — sprite count and mix (sprout → blossom) both
    scale with real upload count. Nothing here is decorative-only:
    every number below the garden is real. */
function BloomGarden({ totalUploads, totalWords, languagesUsed, subtitlesGenerated }) {
  const spriteCount = Math.min(14, Math.max(2, totalUploads));
  // More uploads = more of the garden has "bloomed" into flowers
  // instead of staying sprouts/leaves — purely a visual reward curve,
  // the underlying count driving it is real.
  const bloomChance = Math.min(0.85, 0.15 + totalUploads * 0.04);
  const blossoms = ['🌸', '✿', '❋', '🌷'];
  const sprites = Array.from({ length: spriteCount }, (_, i) => {
    const roll = seededPercent(i, 1);
    const glyph = roll < bloomChance
      ? blossoms[Math.floor(seededPercent(i, 2) * blossoms.length)]
      : (i % 3 === 0 ? '🌿' : '🌱');
    return {
      glyph,
      left: 8 + seededPercent(i, 3) * 84,
      top: 15 + seededPercent(i, 4) * 70,
      size: 1.1 + seededPercent(i, 5) * 1.3,
      delay: seededPercent(i, 6) * 4,
    };
  });

  return (
    <div className="bloom-card">
      <div className="settings-panel-head" style={{ marginBottom: 0 }}>
        <h2>Your Bloom <span aria-hidden="true">✦</span></h2>
      </div>

      <div className="bloom-garden" aria-hidden="true">
        {sprites.map((s, i) => (
          <span
            key={i}
            className="bloom-sprite"
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              fontSize: `${s.size}rem`,
              animationDelay: `${s.delay}s`,
            }}
          >
            {s.glyph}
          </span>
        ))}
      </div>

      <div className="bloom-stats">
        <div><span className="bloom-stat-num">{totalUploads}</span><span className="bloom-stat-label">Videos</span></div>
        <div><span className="bloom-stat-num">{languagesUsed}</span><span className="bloom-stat-label">Languages</span></div>
        <div><span className="bloom-stat-num">{totalWords.toLocaleString()}</span><span className="bloom-stat-label">Words</span></div>
        <div><span className="bloom-stat-num">{subtitlesGenerated}</span><span className="bloom-stat-label">Subtitles</span></div>
      </div>

      <p className="bloom-caption">
        {languagesUsed > 0
          ? `Your content has reached ${languagesUsed} language${languagesUsed === 1 ? '' : 's'}.`
          : 'Translate your first video to start growing your garden.'}
      </p>
    </div>
  );
}

/** Each used language becomes a star — brighter/bigger the more it's
    been used. Pure SVG (circles, lines, text), no image asset. */
function LanguageConstellation({ topLanguages }) {
  const width = 260;
  const height = 170;
  const cx = width / 2;
  const cy = height / 2 + 4;
  const orbit = 62;

  const stars = topLanguages.map(([code, count], i) => {
    const angle = (-90 + (360 / topLanguages.length) * i) * (Math.PI / 180);
    const x = cx + orbit * Math.cos(angle);
    const y = cy + orbit * Math.sin(angle);
    const r = Math.min(11, 3.5 + Math.sqrt(count) * 2.5);
    return { code, count, x, y, r, labelY: y + (y < cy ? -r - 6 : r + 12) };
  });

  return (
    <div className="constellation-card">
      <div className="settings-panel-head" style={{ marginBottom: 0 }}>
        <h2>Language Constellation <span aria-hidden="true">✦</span></h2>
      </div>

      {stars.length === 0 ? (
        <p className="field-hint" style={{ marginTop: '1rem' }}>
          Translate a video into another language to light up your first star.
        </p>
      ) : (
        <svg className="constellation-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Languages you've used, as a constellation">
          <defs>
            <filter id="starGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {stars.map((s) => (
            <line
              key={`line-${s.code}`}
              x1={cx} y1={cy} x2={s.x} y2={s.y}
              stroke="rgba(139, 92, 246, 0.35)"
              strokeWidth="1"
            />
          ))}

          {/* Hub — represents BloomLore/you, everything connects through it */}
          <circle cx={cx} cy={cy} r="4" fill="var(--purple-bright)" filter="url(#starGlow)" />

          {stars.map((s) => (
            <g key={s.code}>
              <circle cx={s.x} cy={s.y} r={s.r} fill="#e9d5ff" filter="url(#starGlow)" />
              <text x={s.x} y={s.labelY} className="constellation-star-label">
                {s.code.toUpperCase()}
              </text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

function EmptyGarden() {
  return (
    <div className="empty-garden">
      <Sparkles size={16} className="empty-garden-star" />
      <div className="empty-garden-sprout">🌱</div>
      <div className="empty-garden-divider" />
      <h3>Your garden is quiet.</h3>
      <p>Upload your first story and watch it bloom.</p>
      <Link
        to="/upload"
        className="btn-generate"
        style={{ width: 'auto', display: 'inline-flex', textDecoration: 'none', padding: '0.65rem 1.4rem' }}
      >
        Upload a Video
      </Link>
    </div>
  );
}

/** Logged-in view — every number here comes from the real /api/lessons response. */
function PrivateDashboard({ session }) {
  const [lessons, setLessons] = useState(null); // null = still loading
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;

    getLessons(session.access_token)
      .then((data) => { if (!cancelled) setLessons(data); })
      .catch((err) => { if (!cancelled) setError(err.message); });

    return () => { cancelled = true; };
  }, [session.access_token]);

  const displayName = session.user.user_metadata?.full_name || session.user.email.split('@')[0];

  // Lessons auto-delete 24h after upload, so these figures reflect
  // what's currently active, not a lifetime total. No fabricated
  // month-over-month deltas here — we don't keep historical snapshots
  // to compute a real "+20% this month" against.
  const totalUploads = lessons?.length ?? 0;
  const totalWords = lessons?.reduce((sum, l) => sum + (l.word_count ?? 0), 0) ?? 0;
  const languagesUsed = lessons
    ? new Set(lessons.filter((l) => l.target_lang !== l.original_lang).map((l) => l.target_lang)).size
    : 0;
  // One subtitle set is genuinely generated per processed lesson (see
  // backend transcription.service) — this isn't a separate fabricated
  // metric, just the same real count under a different label.
  const subtitlesGenerated = totalUploads;

  // Real per-language breakdown (target language of each upload) —
  // feeds both the Language Constellation and the old "world map"
  // stand-in list. This is data we actually have; geo data isn't.
  const langCounts = {};
  lessons?.forEach((l) => {
    langCounts[l.target_lang] = (langCounts[l.target_lang] ?? 0) + 1;
  });
  const topLanguages = Object.entries(langCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const filteredRecent = (lessons ?? [])
    .filter((l) => (l.original_filename ?? '').toLowerCase().includes(query.toLowerCase()))
    .slice(0, 6);

  return (
    <div className="dash-scene">
      <img className="dash-scene-bg" src={heroScene} alt="" aria-hidden="true" />
      <div className="dash-scene-overlay" aria-hidden="true" />
      {/* Same floating glyph system as UploadsPage's scene-bg (twinkle/
          float keyframes live in index.css) — scattered here for depth
          across the full dashboard backdrop instead of one small card. */}
      <span className="dash-scene-glyph twinkle" style={{ top: '6%', left: '10%', fontSize: '1rem' }} aria-hidden="true">✦</span>
      <span className="dash-scene-glyph twinkle" style={{ top: '14%', right: '14%', fontSize: '0.8rem', animationDelay: '1.1s' }} aria-hidden="true">✦</span>
      <span className="dash-scene-glyph twinkle" style={{ top: '4%', left: '46%', fontSize: '0.65rem', animationDelay: '0.6s' }} aria-hidden="true">·</span>
      <span className="dash-scene-glyph dash-scene-glyph--bloom" style={{ bottom: '8%', left: '4%', fontSize: '2.2rem', animation: 'float 6s ease-in-out infinite' }} aria-hidden="true">❋</span>
      <span className="dash-scene-glyph dash-scene-glyph--bloom" style={{ bottom: '4%', right: '8%', fontSize: '1.8rem', animation: 'float 5.5s ease-in-out infinite 1.2s' }} aria-hidden="true">🌸</span>

      <div className="dash-scene-content">
        <div className="dash-welcome-row">
          <div>
            <div className="dash-welcome-glyphs" aria-hidden="true">
              <span className="twinkle">✦</span><span>🌸</span>
            </div>
            <h1 className="page-title">
              Welcome back, <span className="accent">{displayName}</span>! 👋
            </h1>
            <p className="page-sub">Your little corner of BloomLore.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {lessons?.length > 0 && (
              <div className="dash-search-wrap">
                <Search size={15} />
                <input
                  type="text"
                  placeholder="Search your uploads…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            )}
            <Mascot size={52} state="idle" className="header-mascot" />
          </div>
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

        {lessons?.length === 0 && <EmptyGarden />}

        {lessons?.length > 0 && (
          <>
            <div className="dash-columns">
              <BloomGarden
                totalUploads={totalUploads}
                totalWords={totalWords}
                languagesUsed={languagesUsed}
                subtitlesGenerated={subtitlesGenerated}
              />
              <LanguageConstellation topLanguages={topLanguages} />
            </div>

            <div className="section-head" style={{ marginBottom: '0.9rem' }}>
              <div>
                <h2 className="features-title" style={{ margin: 0 }}>Recent Stories</h2>
                <span className="field-hint">
                  {nextExpiryLabel(lessons)}
                </span>
              </div>
              <Link to="/activity" className="link-view-all">View all →</Link>
            </div>

            <div className="story-grid">
              {filteredRecent.length === 0 && (
                <p className="field-hint">No uploads match &ldquo;{query}&rdquo;.</p>
              )}
              {filteredRecent.map((lesson) => (
                <Link key={lesson.id} to={`/activity/${lesson.id}`} className="story-card">
                  <div className="story-art">
                    <span>{FLAG[lesson.target_lang] ?? '🌍'}</span>
                    <span className="story-badge"><Clock size={10} /> {timeLeftLabel(lesson.expires_at)}</span>
                  </div>
                  <div className="story-info">
                    <span className="story-name">{lesson.original_filename ?? 'Untitled video'}</span>
                    <span className="story-meta">
                      {LANG_NAME[lesson.original_lang] ?? lesson.original_lang}
                      {lesson.target_lang !== lesson.original_lang &&
                        ` → ${LANG_NAME[lesson.target_lang] ?? lesson.target_lang}`}
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            <div className="dash-upsell-banner">
              <div className="dash-upsell-icon"><Sparkles size={20} /></div>
              <div className="dash-upsell-text">
                <strong>Unlock unlimited possibilities</strong>
                <span>Upgrade to Pro for more monthly minutes and priority processing.</span>
              </div>
              <div className="dash-upsell-actions">
                <Link to="/plan" className="btn-outline">View Plans</Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Small real detail (soonest-expiring upload), used as a subtitle
    under "Recent Stories" instead of its own dedicated stat card. */
function nextExpiryLabel(lessons) {
  if (!lessons?.length) return '';
  const soonest = lessons.reduce((a, b) => (new Date(a.expires_at) < new Date(b.expires_at) ? a : b));
  return `Next expiry: ${timeLeftLabel(soonest.expires_at)}`;
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