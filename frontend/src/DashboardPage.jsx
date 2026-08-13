import { useEffect, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import {
  AlertCircle, Clock, Sparkles, Hand, Flower2,
} from 'lucide-react';
import Mascot from './Mascot';
import {
  SubtitlesGlyph, MultiLanguageGlyph, GlobalReachGlyph, PrivateSecureGlyph,
  BloomGlyph, WordsGlyph, LanguagesGlyph, ExpiryGlyph,
} from './StatGlyphs';
import { getLessons } from './api';
import heroScene from './assets/hero-scene.webp';
import './DashboardPage.css';

const LANG_NAME = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', hi: 'Hindi',
  zh: 'Chinese', ja: 'Japanese', ko: 'Korean', pt: 'Portuguese',
  ru: 'Russian', ar: 'Arabic', it: 'Italian',
};
// Deterministic color per language code (no flag emoji/images) — same
// hashing approach as the constellation stars, just applied to badges.
const BADGE_COLORS = ['#c084fc', '#67e8f9', '#f472b6', '#a78bfa', '#5eead4', '#fbbf24'];
function badgeColor(code) {
  let hash = 0;
  for (let i = 0; i < (code ?? '').length; i += 1) hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  return BADGE_COLORS[hash % BADGE_COLORS.length];
}
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
          <div className="dash-feature-icon"><SubtitlesGlyph size={22} /></div>
          <span className="dash-feature-title">Accurate Subtitles</span>
          <span className="dash-feature-desc">Deepgram-backed transcription tuned for clean, accurate subtitles.</span>
        </div>
        <div className="dash-feature-card">
          <div className="dash-feature-icon"><MultiLanguageGlyph size={22} /></div>
          <span className="dash-feature-title">Multi-language</span>
          <span className="dash-feature-desc">Translate your subtitles into {SUPPORTED_LANGUAGE_COUNT} languages your audience actually speaks.</span>
        </div>
        <div className="dash-feature-card">
          <div className="dash-feature-icon"><GlobalReachGlyph size={22} /></div>
          <span className="dash-feature-title">Global Reach</span>
          <span className="dash-feature-desc">Share your story with viewers anywhere, in the language they understand.</span>
        </div>
        <div className="dash-feature-card">
          <div className="dash-feature-icon"><PrivateSecureGlyph size={22} /></div>
          <span className="dash-feature-title">Private &amp; Secure</span>
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
      size: 0.85 + seededPercent(i, 5) * 0.75,
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
    </div>
  );
}

/** One card in the right-hand stat column — icon + real number + label,
    matching the four-card column from the design reference. */
function StatCard({ icon, value, label, sub }) {
  return (
    <div className="dash-stat-card">
      <div className="dash-stat-icon">{icon}</div>
      <div className="dash-stat-body">
        <span className="dash-stat-value">{value}</span>
        <span className="dash-stat-label">{label}</span>
        {sub && <span className="dash-stat-sub">{sub}</span>}
      </div>
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
    const r = Math.min(8, 2.6 + Math.sqrt(count) * 1.8);
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
              <feGaussianBlur stdDeviation="2.2" result="blur" />
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
          <circle cx={cx} cy={cy} r="3" fill="var(--purple-bright)" filter="url(#starGlow)" />

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

/** Base-layer starfield — small twinkling ✦ glyphs scattered behind
    every card on the private dashboard. Positions/sizes/delays are
    seeded (via the same seededPercent() used for Bloom garden
    sprites), so they're stable across re-renders, not re-randomized
    on every render. Purely decorative: aria-hidden, no layout impact
    since the whole layer is position:absolute behind real content. */
function Starfield({ count = 26 }) {
  const stars = Array.from({ length: count }, (_, i) => ({
    left: seededPercent(i, 11) * 100,
    top: seededPercent(i, 23) * 100,
    size: 0.35 + seededPercent(i, 37) * 0.55,
    delay: seededPercent(i, 51) * 4,
  }));
  return (
    <div className="dash-starfield" aria-hidden="true">
      {stars.map((s, i) => (
        <span
          key={i}
          className="dash-starfield-star"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            fontSize: `${s.size}rem`,
            animationDelay: `${s.delay}s`,
          }}
        >
          ✦
        </span>
      ))}
    </div>
  );
}

/** Logged-in view — every number here comes from the real /api/lessons response. */
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

  // Same "soonest expiring lesson" used by nextExpiryLabel() below, just
  // read directly here so the new stat card doesn't re-derive it twice.
  const soonestLesson = lessons?.length
    ? lessons.reduce((a, b) => (new Date(a.expires_at) < new Date(b.expires_at) ? a : b))
    : null;

  const recentLessons = (lessons ?? []).slice(0, 6);

  // Shown after the Bloom/Constellation/stats row (or after the empty
  // garden state) either way — matches the design reference, where
  // this banner appears in both the populated and dormant-garden
  // screens, always right before where Recent Stories would go.
  const breakBarriersHero = (
    <div className="dash-hero dash-hero--secondary">
      <div>
        <h2 className="dash-hero-heading dash-hero-heading--sm">
          Break language <span className="accent">barriers</span>. Share your story.
        </h2>
        <p className="dash-hero-sub">
          Upload a video and BloomLore will handle the rest — accurate
          subtitles, translations, and a global audience.
        </p>
        <div className="dash-cta-row">
          <Link to="/upload" className="btn-generate" style={{ width: 'auto', textDecoration: 'none' }}>
            Upload a Video
          </Link>
          <Link to="/activity" className="btn-outline">View Your Activity</Link>
        </div>
      </div>
      <div className="dash-hero-art">
        <img src={heroScene} alt="A cozy pixel-art room at night, BloomLore playing on screen" />
      </div>
    </div>
  );

  return (
    <div className="dash-page">
      <Starfield />

      <div className="dash-page-content">
        {/* Same plain page-header pattern as every other page (see
            ActivityPage/UploadsPage/SettingsPage/PlanPage) — the image-
            backed hero band that used to live here is gone per request. */}
        <div className="page-header">
          <div>
            <div className="dash-welcome-glyphs" aria-hidden="true">
              <span className="twinkle">✦</span>
              <Flower2 size={15} className="welcome-flower-icon" />
            </div>
            <h1 className="page-title">
              Welcome back, <span className="accent">{displayName}</span>!{' '}
              <Hand size={26} className="welcome-wave-icon" />
            </h1>
          </div>
          <Mascot size={52} state="idle" className="header-mascot" />
        </div>

        <div className="dash-body">
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
          <>
            <EmptyGarden />
            {breakBarriersHero}
          </>
        )}

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

              <div className="dash-stat-col">
                {/* Reuses totalUploads — same real count as "Videos" in
                    the Bloom card above, same precedent as
                    subtitlesGenerated reusing totalUploads below: this
                    app doesn't track a separate "processing" status, so
                    rather than fabricate one, both cards show what's
                    actually true. */}
                <StatCard
                  icon={<BloomGlyph size={26} />}
                  value={totalUploads}
                  label="Active uploads"
                />
                <StatCard
                  icon={<WordsGlyph />}
                  value={totalWords.toLocaleString()}
                  label="Words transcribed"
                />
                <StatCard
                  icon={<LanguagesGlyph size={26} />}
                  value={languagesUsed}
                  label="Languages used"
                />
                <StatCard
                  icon={<ExpiryGlyph size={24} />}
                  value={soonestLesson ? timeLeftLabel(soonestLesson.expires_at) : '—'}
                  label="Next expiry"
                />
              </div>
            </div>

            {breakBarriersHero}

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
              {recentLessons.map((lesson) => (
                <Link key={lesson.id} to={`/activity/${lesson.id}`} className="story-card">
                  <div className="story-art">
                    <span
                      className="story-lang-badge"
                      style={{ '--badge-color': badgeColor(lesson.target_lang) }}
                    >
                      {(lesson.target_lang ?? '—').toUpperCase()}
                    </span>
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