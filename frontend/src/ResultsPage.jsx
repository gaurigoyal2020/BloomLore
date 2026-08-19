import React, { useState, useRef, useEffect } from 'react';
import {
  Play, Pause, Download, Edit2, Search,
  Plus, ChevronRight,
  Sparkles, Globe,
  Maximize2, Volume2, SkipBack, SkipForward, Video
} from 'lucide-react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import Mascot from './Mascot';
import { updateLessonSubtitles } from './api';
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

/* ─── Subtitle format converters (client-side, from the raw cue data we
   already have — no backend round-trip needed to export in a different
   format). fmtTime() above is already comma-separated hh:mm:ss,ms, which
   IS the SRT convention, so SRT reuses it directly; VTT just swaps the
   comma for a period. ─── */
const cuesToSRTText = (cues) =>
  cues.map((c, i) => `${i + 1}\n${fmtTime(c.start)} --> ${fmtTime(c.end)}\n${c.text.trim()}\n`).join('\n');

const cuesToVTTText = (cues) => {
  const toVttTs = (sec) => fmtTime(sec).replace(',', '.');
  return 'WEBVTT\n\n' + cues.map((c) => `${toVttTs(c.start)} --> ${toVttTs(c.end)}\n${c.text.trim()}\n`).join('\n');
};

const fmtASSTime = (sec) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  const cs = Math.floor((sec % 1) * 100).toString().padStart(2, '0');
  return `${h}:${m}:${s}.${cs}`;
};
const ASS_HEADER =
`[Script Info]
Title: BloomLore Subtitles
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
const cuesToASSText = (cues) =>
  ASS_HEADER + cues.map((c) => `Dialogue: 0,${fmtASSTime(c.start)},${fmtASSTime(c.end)},Default,,0,0,0,,${c.text.trim().replace(/\n/g, '\\N')}`).join('\n');

const cuesToTXTText = (cues) => cues.map((c) => c.text.trim()).join('\n');

const EXPORT_FORMATS = {
  SRT: { build: cuesToSRTText, mime: 'application/x-subrip', ext: 'srt' },
  VTT: { build: cuesToVTTText, mime: 'text/vtt',              ext: 'vtt' },
  ASS: { build: cuesToASSText, mime: 'text/plain',             ext: 'ass' },
  TXT: { build: cuesToTXTText, mime: 'text/plain',             ext: 'txt' },
};

/** Triggers a browser download of `content` as a file — no server round trip. */
function downloadTextFile(content, filename, mime) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ─── Main Component ─────────────────────────────────────────────── */
const ResultsPage = ({ result: initialResult, file, targetLang, session, onReset }) => {
  const [activeTab, setActiveTab]   = useState('subtitles');
  const [exportFmt, setExportFmt]   = useState('SRT');
  const [searchQ, setSearchQ]       = useState('');

  // result is local state (not the raw prop) so a successful subtitle-edit
  // save can update what's on screen immediately without needing the
  // parent (UploadsPage/LessonDetailPage) to re-fetch or manage this.
  // Re-synced whenever the underlying lesson actually changes (navigating
  // to a different lesson, or a fresh upload landing here) — matched on
  // lessonId, not object identity, since parents don't always pass a
  // stable object reference.
  const [result, setResult] = useState(initialResult);
  useEffect(() => {
    setResult(initialResult);
    setEditing(false);
    setEditedCues(null);
    setSaveError(null);
    setSubtitleVersion(0);
  }, [initialResult?.lessonId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subtitle editing state. Only text changes — timing (start/end) is
  // never touched, so a Save always sends back the exact same start/end
  // values the cues already had.
  const [editing,     setEditing]     = useState(false);
  const [editedCues,  setEditedCues]  = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState(null);

  // Show the TRANSLATED cues when a translation happened — otherwise this
  // tab is stuck showing the original language no matter what target
  // language was picked, regardless of the "Subtitles" label implying it
  // should reflect the user's chosen language.
  const rawCues    = result?.translatedSubtitles || result?.subtitles || [];
  const subtitles  = parseSubtitles(rawCues);
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
  // Whichever cue array is actually on screen (translated if present,
  // otherwise original) is also the one edits/saves apply to.
  const editingField = translationSucceeded ? 'translatedSubtitles' : 'subtitles';
  // result.originalFilename is now returned by both the live job-status
  // poll and lesson history (see job.service.js) — preferring it over the
  // client-side `file` prop means the name shown is the same regardless
  // of whether this is a fresh upload, a job resumed after a page
  // refresh (where `file` is only ever a name/size stand-in), or a past
  // lesson. `file?.name` stays as a fallback for the brief window right
  // after upload before a job result exists at all.
  const fileName   = (result?.originalFilename || file?.name)?.replace(/\.[^.]+$/, '') || 'My Awesome Video';
  // Same reasoning as fileName above — result.fileSize is now persisted
  // and returned for BOTH the live job result and history views (see
  // job.service.js / db.service.js), so it's available consistently
  // instead of only existing for the brief window right after a fresh
  // upload where the browser's File object is still in memory.
  const fileSizeMB = (result?.fileSize ?? file?.size)
    ? ((result?.fileSize ?? file.size) / (1024 * 1024)).toFixed(2)
    : '—';
  const wordCount  = result?.wordCount || subtitles.length * 8;

  // Bumped on every successful subtitle save so VideoPlayer's `key` below
  // changes and React remounts it — otherwise the player keeps its
  // existing <track> elements pointing at the same URLs, and since the
  // edited .vtt file is re-uploaded to that SAME url (see job.service.js
  // key structure), the browser has no reason to refetch it: captions
  // would silently stay stale even though the edit saved successfully.
  const [subtitleVersion, setSubtitleVersion] = useState(0);

  /* ── Edit Subtitles ── */
  const startEditing = () => {
    setActiveTab('subtitles');
    setEditedCues(rawCues.map((c) => ({ ...c })));
    setSaveError(null);
    setEditing(true);
  };
  const cancelEditing = () => {
    setEditing(false);
    setEditedCues(null);
    setSaveError(null);
  };
  const updateCueText = (index, text) => {
    setEditedCues((prev) => prev.map((c, i) => (i === index ? { ...c, text } : c)));
  };
  const saveEditing = async () => {
    if (!session?.access_token) {
      setSaveError('You need to be logged in to save changes.');
      return;
    }
    if (!result?.lessonId) {
      setSaveError("This lesson hasn't finished processing yet — try again once it's done.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const payload = { [editingField]: editedCues };
      const updated = await updateLessonSubtitles(result.lessonId, payload, session.access_token);
      setResult(updated);
      setEditing(false);
      setEditedCues(null);
      setSubtitleVersion((v) => v + 1);
    } catch (err) {
      setSaveError(err.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  /* ── Export ── */
  const handleExportAll = () => {
    if (!rawCues.length) return;
    const fmt = EXPORT_FORMATS[exportFmt];
    downloadTextFile(fmt.build(rawCues), `${fileName || 'subtitles'}.${fmt.ext}`, fmt.mime);
  };

  // Real duration derived from the last cue's end timestamp — the actual
  // transcribed timing, not the `subtitles.length * 4` guess used
  // elsewhere before. There's no separately-reported video length from
  // the backend, but the transcript necessarily covers close to the
  // full runtime, so this is a genuine measurement, not a fabrication.
  const durationSeconds = rawCues.length ? rawCues[rawCues.length - 1].end : 0;

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
          <button
            className="rp-btn-outline"
            onClick={editing ? cancelEditing : startEditing}
            disabled={!rawCues.length || saving}
          >
            <Edit2 size={15} /> {editing ? 'Cancel Editing' : 'Edit Subtitles'}
          </button>
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
                key={`${result?.lessonId || result?.videoUrl}:${subtitleVersion}`}
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
                        placeholder={editing ? 'Search disabled while editing' : 'Search in subtitles...'}
                        value={searchQ}
                        onChange={e => setSearchQ(e.target.value)}
                        disabled={editing}
                      />
                    </div>
                  </div>

                  <div className="rp-sub-list">
                    {editing ? (
                      editedCues.map((cue, idx) => (
                        <div key={idx} className="rp-sub-row rp-sub-row--editing">
                          <span className="rp-sub-num">{idx + 1}</span>
                          <div className="rp-sub-body">
                            <span className="rp-sub-ts">{fmtTime(cue.start)} --&gt; {fmtTime(cue.end)}</span>
                            <textarea
                              className="rp-sub-edit-input"
                              value={cue.text}
                              onChange={(e) => updateCueText(idx, e.target.value)}
                              rows={2}
                            />
                          </div>
                        </div>
                      ))
                    ) : (
                      filtered.map(s => (
                        <div key={s.id} className="rp-sub-row">
                          <span className="rp-sub-num">{s.id}</span>
                          <div className="rp-sub-body">
                            <span className="rp-sub-ts">{s.start} --&gt; {s.end}</span>
                            <span className="rp-sub-text">{s.text}</span>
                          </div>
                          <span className="rp-sub-dur">{s.duration}</span>
                        </div>
                      ))
                    )}
                  </div>

                  {editing && (
                    <div className="rp-edit-actions">
                      {saveError && <span className="rp-edit-error">{saveError}</span>}
                      <button className="rp-btn-ghost" onClick={cancelEditing} disabled={saving}>
                        Cancel
                      </button>
                      <button className="rp-btn-primary" onClick={saveEditing} disabled={saving}>
                        {saving ? 'Saving…' : 'Save Changes'}
                      </button>
                    </div>
                  )}

                  <div className="rp-sub-footer">
                    <span>{subtitles.length} subtitles</span>
                    <span>Total Duration: {fmtTime(durationSeconds)}</span>
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
                {[
                  { label: 'Duration',  value: fmtTime(durationSeconds) },
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

          {/* Language & Translation — one card. Used to be two separate
              cards, with the second one always listing 3 languages
              (target + hardcoded 'ko'/'es') regardless of what actually
              happened — misleading, since this app only ever translates
              to the single language the user picked. */}
          <div className="rp-card rp-lang-card">
            <div className="rp-card-title">
              <span className="rp-card-icon">🔍</span> Language &amp; Translation
              <div className="rp-trans-mascots">
                <Mascot size={32} state="done" />
              </div>
            </div>

            <div className="rp-trans-row">
              <span className="rp-trans-flag">{FLAG[langCode] || '🌍'}</span>
              <span className="rp-trans-name">Detected: {LANG_NAME[langCode] || langCode.toUpperCase()}</span>
              <span className="rp-trans-status">Original</span>
            </div>

            {translationRequested && (
              <div className="rp-trans-row">
                <span className="rp-trans-flag">{FLAG[targetCode] || '🌍'}</span>
                <span className="rp-trans-name">{LANG_NAME[targetCode] || targetCode}</span>
                <span className={`rp-trans-status ${translationSucceeded ? '' : 'rp-trans-status--failed'}`}>
                  {translationSucceeded ? 'Completed' : 'Failed'}
                </span>
                {translationSucceeded ? (
                  <a href={result.translatedSubtitleUrl} download className="rp-trans-dl">
                    <Download size={13} />
                  </a>
                ) : (
                  <button className="rp-trans-dl" disabled><Download size={13} /></button>
                )}
              </div>
            )}
            {!translationRequested && (
              <p className="rp-no-trans">Target language matches the detected language — no translation needed.</p>
            )}
            {translationFailed && (
              <p className="rp-no-trans">
                Translation couldn&rsquo;t be completed — subtitles above are shown in the original language.
              </p>
            )}

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

            {rawCues.length ? (
              <button className="rp-btn-export-all" onClick={handleExportAll}>
                <Download size={15} /> Export
              </button>
            ) : (
              <button className="rp-btn-export-all" disabled>
                <Download size={15} /> Export
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default ResultsPage;