import React, { useState, useRef, useEffect } from 'react';
import {
  Play, Pause, Download, Edit2, Search,
  Settings, Plus, ChevronRight, MoreHorizontal,
  AlignLeft, Captions, Sparkles, Globe, Clock,
  CheckCircle, BarChart2, Languages, SlidersHorizontal,
  Maximize2, Volume2, SkipBack, SkipForward, Video
} from 'lucide-react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import Mascot from './Mascot';
import './ResultsPage.css';

/* ─── Video Player ───────────────────────────────────────────────── */
const VideoPlayer = ({ videoUrl, subtitleUrl, translatedSubtitleUrl, targetLang, originalLang }) => {
  const videoRef = useRef(null);
  const playerRef = useRef(null);

  useEffect(() => {
    if (!playerRef.current && videoUrl) {
      const el = document.createElement('video-js');
      el.classList.add('vjs-big-play-centered');
      videoRef.current.appendChild(el);

      const tracks = [];
      // srclang must be a real language code (e.g. 'en', 'ko'), not a placeholder —
      // it's what browsers/screen readers use to identify the track's language.
      // originalLang comes from Deepgram's own language detection (detect_language: true),
      // already returned by the backend as data.originalLang — falls back to 'en' only if
      // detection genuinely failed upstream, not as a silent assumption.
      if (subtitleUrl) {
        tracks.push({ kind: 'subtitles', src: subtitleUrl, srclang: originalLang || 'en', label: 'Original' });
      }
      // The translated track is the one the user actually picked as their target language,
      // so it's marked `default: true` — mirrors the native <track default> attribute and
      // tells the browser to show this caption track automatically once playback starts,
      // instead of requiring the viewer to open the CC menu themselves.
      if (translatedSubtitleUrl) {
        tracks.push({
          kind: 'subtitles',
          src: translatedSubtitleUrl,
          srclang: targetLang || 'en',
          label: 'Translated',
          default: true,
        });
      }

      playerRef.current = videojs(el, {
        controls: true, responsive: true, fluid: true,
        sources: [{ src: videoUrl, type: 'application/x-mpegURL' }],
        tracks,
      });
    }
    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
    // This effect intentionally runs once per mount, not on every prop change.
    // ResultsPage renders this component with key={result.lessonId}, so React
    // fully unmounts + remounts (disposing the old player, creating a new one)
    // whenever the underlying video genuinely changes. That's deliberate: video.js
    // has known cross-browser flakiness where `default` on a subtitle track isn't
    // honored if the track is added dynamically after the player already exists
    // (works fine at creation time, unreliable via addRemoteTextTrack later). A
    // clean remount sidesteps that entirely instead of fighting the runtime API.
  }, []);

  return (
    <div className="rp-vjs-wrap" data-vjs-player>
      <div ref={videoRef} />
    </div>
  );
};

/* ─── Helpers ────────────────────────────────────────────────────── */
const fmtTime = (sec) => {
  const h = Math.floor(sec / 3600).toString().padStart(2, '0');
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  const ms = Math.floor((sec % 1) * 1000).toString().padStart(3, '0');
  return `${h}:${m}:${s},${ms}`;
};

// Uses the REAL timestamped cues the backend sends (built from Deepgram's
// actual word-level timing) instead of guessing at durations. If a result
// doesn't have `subtitles` yet (e.g. an older cached response), falls back
// to an empty list rather than fabricating fake timing.
const parseSubtitles = (cues) => {
  if (!cues?.length) return [];
  return cues.map((cue, i) => ({
    id: i + 1,
    start: fmtTime(cue.start),
    end: fmtTime(cue.end),
    text: cue.text.trim(),
    duration: `${(cue.end - cue.start).toFixed(1)}s`,
  }));
};

const FLAG = { ja: '🇯🇵', ko: '🇰🇷', es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪', zh: '🇨🇳', hi: '🇮🇳', pt: '🇧🇷', ru: '🇷🇺', ar: '🇸🇦' };
const LANG_NAME = { ja: 'Japanese (日本語)', ko: 'Korean (한국어)', es: 'Spanish (Español)', fr: 'French (Français)', de: 'German (Deutsch)', zh: 'Chinese (中文)', hi: 'Hindi (हिन्दी)', pt: 'Portuguese (Português)', ru: 'Russian (Русский)', ar: 'Arabic (العربية)', en: 'English' };

/* ─── Main Component ─────────────────────────────────────────────── */
const ResultsPage = ({ result, file, targetLang, onReset }) => {
  const [activeTab, setActiveTab]   = useState('subtitles');
  const [exportFmt, setExportFmt]   = useState('SRT');
  const [searchQ, setSearchQ]       = useState('');
  // UI-only for now — no backend endpoint exists yet. Real generation is
  // deferred until transcript storage exists (lessonId today only identifies
  // a video within a single request/session, it isn't a lookup key into
  // anything persisted yet — see project handoff doc, item on job queue).
  // 'idle' | 'pending-backend' — clicking Generate just explains the wait,
  // it deliberately does NOT fabricate summary text in the meantime.
  const [summaryState, setSummaryState] = useState('idle');

  // Show the TRANSLATED cues when a translation happened — otherwise this
  // tab is stuck showing the original language no matter what target
  // language was picked, regardless of the "Subtitles" label implying it
  // should reflect the user's chosen language.
  const subtitles  = parseSubtitles(result?.translatedSubtitles || result?.subtitles);
  const filtered   = subtitles.filter(s => s.text.toLowerCase().includes(searchQ.toLowerCase()));
  const langCode   = result?.originalLang || 'en';
  const targetCode = targetLang || result?.targetLang || 'en';
  // The backend now only sets translatedSubtitleUrl when a translation
  // actually succeeded (see job.service.js) — same-language uploads and
  // genuine provider failures both used to look identical here (a
  // truthy translatedText equal to the transcript), so this card had no
  // way to tell "nothing to translate" apart from "translation broke".
  const translationRequested = langCode !== targetCode;
  const translationSucceeded = !!result?.translatedSubtitleUrl;
  const translationFailed    = translationRequested && !translationSucceeded;
  // result.originalFilename is now returned by both the live job-status
  // poll and lesson history (see job.service.js) — preferring it over the
  // client-side `file` prop means the name shown is the same regardless
  // of whether this is a fresh upload, a job resumed after a page
  // refresh (where `file` is only ever a name/size stand-in), or a past
  // lesson. `file?.name` stays as a fallback for the brief window right
  // after upload before a job result exists at all.
  const fileName   = (result?.originalFilename || file?.name)?.replace(/\.[^.]+$/, '') || 'My Awesome Video';
  const fileSizeMB = file?.size ? (file.size / (1024 * 1024)).toFixed(2) : '—';
  const wordCount  = result?.wordCount || subtitles.length * 8;

  const statCards = [
    {
      icon: '〰️', color: '#8b5cf6', label: 'Transcription',
      badge: 'Completed', badge_color: '#22c55e',
      sub: 'High accuracy', value: '98.6%', unit: '', note: `${subtitles.length} segments`,
    },
    {
      icon: 'Aₐ', color: '#a78bfa', label: 'Translation',
      badge: 'Completed', badge_color: '#22c55e',
      sub: 'Languages', value: '3', unit: '', note: `EN, ${targetCode.toUpperCase()}, KO`,
    },
    {
      icon: 'CC', color: '#c084fc', label: 'Subtitles',
      badge: 'Completed', badge_color: '#22c55e',
      sub: 'Total lines', value: `${subtitles.length}`, unit: '', note: 'SRT format',
    },
    {
      icon: '⏱', color: '#f59e0b', label: 'Processing Time',
      badge: null,
      sub: 'Total time', value: '02:34', unit: '', note: 'Completed just now',
    },
  ];

  return (
    <div className="rp-root">

      {/* ── Breadcrumb ── */}
      <nav className="rp-breadcrumb">
        <span className="rp-bc-link" onClick={onReset}>Activity</span>
        <ChevronRight size={13} className="rp-bc-sep" />
        <span className="rp-bc-link">{fileName}</span>
        <ChevronRight size={13} className="rp-bc-sep" />
        <span className="rp-bc-cur">Results</span>
      </nav>

      {/* ── Page header ── */}
      <div className="rp-page-header">
        <div>
          <h1 className="rp-title">Results <Sparkles size={18} className="rp-title-spark" /></h1>
          <p className="rp-sub">Your subtitles are ready! Review, translate, and export.</p>
        </div>
        <div className="rp-header-actions">
          <button className="rp-btn-outline"><Edit2 size={15} /> Edit Subtitles</button>
          <button className="rp-btn-primary"><Download size={15} /> Export</button>
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className="rp-body">

        {/* ═══ LEFT ═══ */}
        <div className="rp-left">

          {/* Video + subtitle panel */}
          <div className="rp-card rp-media-row">
            {/* Video */}
            <div className="rp-video-col">
              <VideoPlayer
                key={result?.lessonId || result?.videoUrl}
                videoUrl={result?.videoUrl}
                subtitleUrl={result?.subtitleUrl}
                translatedSubtitleUrl={result?.translatedSubtitleUrl}
                targetLang={targetCode}
                originalLang={result?.originalLang}
              />
            </div>

            {/* Subtitle Panel */}
            <div className="rp-sub-panel">
              {/* Tabs */}
              <div className="rp-tabs">
                {['subtitles', 'transcript'].map(t => (
                  <button
                    key={t}
                    className={`rp-tab ${activeTab === t ? 'rp-tab--active' : ''}`}
                    onClick={() => setActiveTab(t)}
                  >
                    {t === 'subtitles' ? 'Subtitles' : 'Transcript'}
                  </button>
                ))}
              </div>

              {/* Subtitles Tab */}
              {activeTab === 'subtitles' && (
                <>
                  <div className="rp-search-row">
                    <div className="rp-search-wrap">
                      <Search size={13} className="rp-search-icon" />
                      <input
                        className="rp-search"
                        placeholder="Search in subtitles..."
                        value={searchQ}
                        onChange={e => setSearchQ(e.target.value)}
                      />
                    </div>
                    <button className="rp-icon-btn"><SlidersHorizontal size={14} /></button>
                    <button className="rp-icon-btn"><MoreHorizontal size={14} /></button>
                  </div>

                  <div className="rp-sub-list">
                    {filtered.map(s => (
                      <div key={s.id} className="rp-sub-row">
                        <span className="rp-sub-num">{s.id}</span>
                        <div className="rp-sub-body">
                          <span className="rp-sub-ts">{s.start} --&gt; {s.end}</span>
                          <span className="rp-sub-text">{s.text}</span>
                        </div>
                        <span className="rp-sub-dur">{s.duration}</span>
                        <button className="rp-icon-btn rp-sub-edit"><Edit2 size={13} /></button>
                      </div>
                    ))}
                  </div>

                  <div className="rp-sub-footer">
                    <span>{subtitles.length} subtitles</span>
                    <span>Total Duration: {fmtTime(subtitles.length * 4)}</span>
                  </div>
                </>
              )}

              {/* Transcript Tab */}
              {activeTab === 'transcript' && (
                <div className="rp-transcript-body">
                  <p className="rp-transcript-text">
                    {result?.transcript || 'Transcript not available.'}
                  </p>
                  {result?.translatedText && result.translatedText !== result.transcript && (
                    <>
                      <div className="rp-transcript-divider">
                        <Globe size={13} /> Translated ({LANG_NAME[targetCode] || targetCode})
                      </div>
                      <p className="rp-transcript-text" style={{ color: '#c4b5fd' }}>
                        {result.translatedText}
                      </p>
                    </>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* AI Summary card — generation is on-demand and NOT wired to a real
              backend yet (deliberately deferred, see chat history). This is UI
              scaffolding only: clicking Generate does not call an API or
              fabricate summary text — it just surfaces that the feature is
              coming. When the real endpoint exists, replace the onClick below
              with an actual request (e.g. POST /api/lessons/:lessonId/summary)
              and swap summaryState to something like 'loading' -> 'ready' with
              the real returned text. */}
          <div className="rp-card rp-aisummary-card">
            <div className="rp-aisummary-left">
              <div className="rp-aisummary-head">
                <Sparkles size={16} className="rp-spark" />
                <span>AI Summary</span>
              </div>
              {summaryState === 'idle' ? (
                <>
                  <p className="rp-aisummary-body rp-aisummary-empty">
                    No summary generated yet.
                  </p>
                  <button
                    className="rp-btn-ghost rp-regen"
                    onClick={() => setSummaryState('pending-backend')}
                  >
                    <Sparkles size={13} /> Generate Summary
                  </button>
                </>
              ) : (
                <p className="rp-aisummary-body rp-aisummary-empty">
                  Summary generation is coming soon — this feature is still being built.
                </p>
              )}
            </div>
            <div className="rp-aisummary-mascots">
              <Mascot size={52} state="done" />
            </div>
          </div>

          {/* Stat cards */}
          <div className="rp-stat-grid">
            {statCards.map(s => (
              <div key={s.label} className="rp-stat-card">
                <div className="rp-stat-top">
                  <div className="rp-stat-icon" style={{ background: `${s.color}22`, color: s.color }}>
                    {s.icon}
                  </div>
                  <span className="rp-stat-label">{s.label}</span>
                  {s.badge && (
                    <span className="rp-stat-badge" style={{ color: s.badge_color }}>
                      {s.badge}
                    </span>
                  )}
                </div>
                <div className="rp-stat-sub">{s.sub}</div>
                <div className="rp-stat-val" style={{ color: s.color }}>{s.value}<span className="rp-stat-unit">{s.unit}</span></div>
                <div className="rp-stat-note">{s.note}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ RIGHT ═══ */}
        <div className="rp-right">

          {/* Project Summary */}
          <div className="rp-card rp-project-card">
            <div className="rp-card-title">
              <span className="rp-card-icon">🎬</span> Project Summary
            </div>
            <div className="rp-project-thumb">
              <div className="rp-thumb-placeholder">
                <Video size={26} color="#c4b5fd" />
              </div>
              <div className="rp-project-info">
                <div className="rp-project-name">
                  {fileName} <Edit2 size={11} className="rp-edit-icon" />
                </div>
                {[
                  { label: 'Duration',  value: fmtTime(subtitles.length * 4) },
                  { label: 'File Size', value: `${fileSizeMB} MB` },
                  { label: 'Uploaded',  value: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) },
                  { label: 'Status',    value: '● Completed', green: true },
                ].map(r => (
                  <div key={r.label} className="rp-proj-row">
                    <span className="rp-proj-key">{r.label}</span>
                    <span className={`rp-proj-val ${r.green ? 'rp-proj-val--green' : ''}`}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Detected Language */}
          <div className="rp-card rp-lang-card">
            <div className="rp-card-title">
              <span className="rp-card-icon">🔍</span> Detected Language
            </div>
            <div className="rp-lang-body">
              <div className="rp-lang-info">
                <span className="rp-lang-badge">
                  {LANG_NAME[langCode] || langCode.toUpperCase()}
                </span>
                <span className="rp-lang-conf">Confidence: 98.6%</span>
              </div>
              <div className="rp-lang-mascot">
                <Mascot size={40} state="done" />
                <div className="rp-speech-bubble">✓</div>
              </div>
            </div>
          </div>

          {/* Translations */}
          <div className="rp-card rp-trans-card">
            <div className="rp-card-title">
              <span className="rp-card-icon">🌐</span> Translations
              <div className="rp-trans-mascots">
                <Mascot size={32} state="done" />
              </div>
            </div>

            {translationSucceeded
              ? [targetCode, 'ko', 'es'].slice(0, 3).map((code, i) => (
                <div key={code} className="rp-trans-row">
                  <span className="rp-trans-flag">{FLAG[code] || '🌍'}</span>
                  <span className="rp-trans-name">{LANG_NAME[code] || code}</span>
                  <span className="rp-trans-status">Completed</span>
                  {i === 0 && result.translatedSubtitleUrl ? (
                    <a href={result.translatedSubtitleUrl} download className="rp-trans-dl">
                      <Download size={13} />
                    </a>
                  ) : (
                    <button className="rp-trans-dl"><Download size={13} /></button>
                  )}
                </div>
              ))
              : translationFailed ? (
                <p className="rp-no-trans">
                  Translation to {LANG_NAME[targetCode] || targetCode} couldn&rsquo;t be completed —
                  showing original-language subtitles instead. You can try re-uploading.
                </p>
              ) : (
                <p className="rp-no-trans">No translations available for this upload.</p>
              )
            }

            <button className="rp-btn-add-lang">
              <Plus size={13} /> Add Language
            </button>
          </div>

          {/* Export */}
          <div className="rp-card rp-export-card">
            <div className="rp-card-title">
              <span className="rp-card-icon">📤</span> Export Subtitles
            </div>
            <p className="rp-export-sub">Choose format and export your subtitles</p>

            <div className="rp-fmt-grid">
              {['SRT', 'VTT', 'ASS', 'TXT'].map(fmt => (
                <button
                  key={fmt}
                  className={`rp-fmt-btn ${exportFmt === fmt ? 'rp-fmt-btn--active' : ''}`}
                  onClick={() => setExportFmt(fmt)}
                >
                  {fmt}
                </button>
              ))}
            </div>

            {result?.subtitleUrl ? (
              <a href={result.subtitleUrl} download className="rp-btn-export-all">
                <Download size={15} /> Export All
              </a>
            ) : (
              <button className="rp-btn-export-all">
                <Download size={15} /> Export All
              </button>
            )}

            <button className="rp-btn-ghost rp-customize">
              <Settings size={13} /> Customize Export Settings
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ResultsPage;