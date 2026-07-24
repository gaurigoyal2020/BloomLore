import React, { useState } from 'react';
import {
  Upload, CheckCircle, AlertCircle,
  Captions, ChevronDown, LayoutDashboard,
  FolderOpen, Settings, CreditCard
} from 'lucide-react';
import ResultsPage from './ResultsPage';
import ProcessingPage from './ProcessingPage';
import Mascot from './Mascot';
import { submitUpload, getJobStatus } from './api';
import './index.css';

/* ─── Scene Background ───────────────────────────────────────────── */
const SceneBg = () => (
  <div className="scene-bg" aria-hidden="true">
    <div className="scene-sparkle">✦</div>
    <div className="scene-star s1">✦</div>
    <div className="scene-star s2">✦</div>
    <div className="scene-star s3">·</div>
    <div className="scene-star s4">✦</div>
    <div className="scene-star s5">·</div>
    <div className="scene-star s6">✦</div>
    <div className="scene-hydrangea h1">❋</div>
    <div className="scene-hydrangea h2">❋</div>
    <div className="scene-hydrangea h3">❋</div>
    <div className="scene-mascot-left"><Mascot size={56} state="idle" /></div>
  </div>
);

/* ─── Sidebar ────────────────────────────────────────────────────── */
const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard'  },
  { icon: FolderOpen,      label: 'Projects'   },
  { icon: Upload,          label: 'Uploads', active: true },
  { icon: Captions,        label: 'Subtitles'  },
  { icon: CreditCard,      label: 'My Plan'    },
  { icon: Settings,        label: 'Settings'   },
];

const Sidebar = ({ mascotState }) => (
  <aside className="sidebar">
    <div className="sidebar-logo">
      <Mascot size={32} state={mascotState} />
      <span className="logo-text">BloomLore</span>
    </div>
    <nav className="sidebar-nav">
      {navItems.map(({ icon: Icon, label, active }) => (
        <div key={label} className={`nav-item ${active ? 'nav-item--active' : ''}`}>
          <Icon size={18} />
          <span>{label}</span>
        </div>
      ))}
    </nav>
    <div className="sidebar-footer">
      <div className="plan-label">Free Plan</div>
      <div className="plan-sub">2 of 5 uploads used</div>
      <div className="plan-bar">
        <div className="plan-bar-fill" style={{ width: '40%' }} />
      </div>
      <button className="btn-upgrade">Upgrade Plan</button>
    </div>
  </aside>
);

/* ─── Feature Cards Data ─────────────────────────────────────────── */
const features = [
  { icon: '🧠', title: 'AI-Powered',      desc: 'Advanced AI for high accuracy transcription' },
  { icon: '🌍', title: 'Multi-Language',  desc: 'Translate to 100+ languages' },
  { icon: 'T',  title: 'Customizable',   desc: 'Edit and style your subtitles' },
  { icon: '⬇',  title: 'Export Anywhere', desc: 'SRT, VTT, ASS and more' },
];

/* ─── Languages ──────────────────────────────────────────────────── */
const languages = [
  { code: 'en', name: 'English'    }, { code: 'es', name: 'Spanish'    },
  { code: 'fr', name: 'French'     }, { code: 'de', name: 'German'     },
  { code: 'hi', name: 'Hindi'      }, { code: 'zh', name: 'Chinese'    },
  { code: 'ja', name: 'Japanese'   }, { code: 'ko', name: 'Korean'     },
  { code: 'pt', name: 'Portuguese' }, { code: 'ru', name: 'Russian'    },
  { code: 'ar', name: 'Arabic'     }, { code: 'it', name: 'Italian'    },
];

/* ─── App ────────────────────────────────────────────────────────── */
function App() {
  const [file,       setFile]       = useState(null);
  const [targetLang, setTargetLang] = useState('en');
  const [uploading,  setUploading]  = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [result,     setResult]     = useState(null);
  const [error,      setError]      = useState(null);
  const [dragActive, setDragActive] = useState(false);

  /* ── Drag handlers ── */
  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (f.type.startsWith('video/')) { setFile(f); setError(null); }
    else setError('Please upload a valid video file');
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type.startsWith('video/')) { setFile(f); setError(null); }
    else setError('Please upload a valid video file');
  };

  /* ── Upload progress mapping ──
     Maps the backend's real pipeline stages to a 0-100 number for the
     progress bar. File transfer itself gets 0-15% (it's the fastest,
     most predictable part); the remaining 15-100% is split across the
     real backend stages reported by GET /api/status/:jobId. Every one
     of these numbers now reflects something that's ACTUALLY happening
     server-side — there's no timer pretending progress is being made.
  */
  const STAGE_PROGRESS = {
    queued: 15,
    converting: 30,
    transcribing: 55,
    translating: 78,
    'building-subtitles': 92,
    done: 100,
  };
  const POLL_INTERVAL_MS = 2000;

  /* ── Upload ──
     Two real phases now, both reflected honestly in the progress bar:
       1. File transfer to the server (submitUpload) — real XHR progress,
          scaled into the 0-15% slice of the bar.
       2. Background processing (ffmpeg -> Deepgram -> translation ->
          subtitles) — the server does this AFTER already responding with
          a jobId, so we poll GET /api/status/:jobId every 2s and read the
          real current stage, mapped to 15-100% via STAGE_PROGRESS above.
     This replaces the old setInterval() that just ticked the number up
     by 1 every 600ms regardless of what the server was actually doing —
     that was a real fake-progress bug, same category as the other fake
     data you've had me fix elsewhere in this app.
  */
  const handleUpload = async () => {
    if (!file) { setError('Please select a video file'); return; }

    setUploading(true); setError(null); setProgress(0);

    try {
      const { jobId } = await submitUpload(file, targetLang, (pct) => {
        // pct here is 0-100 for the transfer alone; scale it down into
        // this bar's 0-15% slice for the transfer phase.
        setProgress((prev) => Math.max(prev, Math.round(pct * 0.15)));
      });

      await pollUntilDone(jobId);
    } catch (err) {
      setError(err.message || 'Failed to process video. Please try again.');
      setUploading(false);
      setProgress(0);
    }
  };

  /* ── Poll a job until it's complete or errors out ──
     Recursive setTimeout rather than setInterval: each poll waits for
     the previous one to fully finish before scheduling the next, so
     slow network responses can't pile up multiple overlapping requests.
  */
  const pollUntilDone = (jobId) => {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const status = await getJobStatus(jobId);

          if (status.status === 'error') {
            reject(new Error(status.error || 'Processing failed'));
            return;
          }

          setProgress(STAGE_PROGRESS[status.stage] ?? 15);

          if (status.status === 'complete') {
            setResult(status.result);
            setTimeout(() => setUploading(false), 500);
            resolve();
            return;
          }

          setTimeout(poll, POLL_INTERVAL_MS);
        } catch (err) {
          reject(err);
        }
      };
      poll();
    });
  };

  /* ── Reset ── */
  const resetForm = () => {
    setFile(null); setResult(null);
    setError(null); setProgress(0); setUploading(false);
  };

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div className="app-layout">
      {/* Same three-state logic used just below to pick which page to
          render — the mascot now just mirrors it instead of always
          showing 'idle' regardless of what's actually happening. */}
      <Sidebar mascotState={uploading ? 'active' : result ? 'done' : 'idle'} />

      <main className="main-content">

        {/* ════ STATE 1 — Processing ════ */}
        {uploading ? (
          <ProcessingPage
            progress={progress}
            file={file}
            onBackground={() => {}}
          />

        /* ════ STATE 2 — Results ════ */
        ) : result ? (
          <ResultsPage
            result={result}
            file={file}
            targetLang={targetLang}
            onReset={resetForm}
          />

        /* ════ STATE 3 — Upload page ════ */
        ) : (
          <>
            {/* Page header */}
            <div className="page-header">
              <div>
                <h1 className="page-title">
                  Upload Your Video
                  <span className="title-icon" aria-hidden="true"> 🎬</span>
                </h1>
                <p className="page-sub">Let BloomLore generate accurate subtitles for you</p>
              </div>
              <Mascot size={56} state="idle" className="header-mascot" />
            </div>

            {/* Two-column layout */}
            <div className="upload-grid">

              {/* LEFT — drop zone + features */}
              <div className="upload-left">
                <div className="drop-card">
                  <SceneBg />
                  <div
                    className={`drop-zone ${dragActive ? 'drop-zone--active' : ''} ${file ? 'drop-zone--has-file' : ''}`}
                    onDragEnter={handleDrag} onDragLeave={handleDrag}
                    onDragOver={handleDrag}  onDrop={handleDrop}
                  >
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleFileChange}
                      className="drop-input"
                    />
                    <div className="drop-inner">
                      <div className="drop-cloud-icon">☁</div>
                      {file ? (
                        <>
                          <p className="drop-title" style={{ color: '#a78bfa' }}>{file.name}</p>
                          <p className="drop-hint" style={{ color: '#22c55e' }}>
                            <CheckCircle size={14} style={{ display: 'inline', marginRight: 4 }} />
                            {(file.size / (1024 * 1024)).toFixed(2)} MB — ready
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="drop-title">Drag &amp; drop your video here</p>
                          <p className="drop-or">or</p>
                          <button className="btn-browse" type="button">📁 Browse Files</button>
                          <p className="drop-hint">Supports: MP4, MOV, MKV, AVI, WEBM · Max 2 GB</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Why BloomLore */}
                <div className="features-section">
                  <h2 className="features-title">✦ Why BloomLore?</h2>
                  <div className="features-grid">
                    {features.map(f => (
                      <div key={f.title} className="feature-card">
                        <div className="feature-icon">{f.icon}</div>
                        <div className="feature-name">{f.title}</div>
                        <div className="feature-desc">{f.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT — settings */}
              <div className="settings-panel">
                <div className="settings-card">
                  <h2 className="settings-title">Upload Settings</h2>

                  <div className="field-group">
                    <label className="field-label">Translate To</label>
                    <div className="select-wrap">
                      <select
                        value={targetLang}
                        onChange={e => setTargetLang(e.target.value)}
                        className="hy-select"
                      >
                        {languages.map(l => (
                          <option key={l.code} value={l.code}>{l.name}</option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="select-arrow" />
                    </div>
                    <span className="field-hint">Target language for subtitles</span>
                  </div>

                  {error && (
                    <div className="alert-error">
                      <AlertCircle size={16} />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    onClick={handleUpload}
                    disabled={!file}
                    className="btn-generate"
                  >
                    <Captions size={18} /> Generate Subtitles
                  </button>

                  <div className="tips-card">
                    <div className="tips-title">Tips for better results</div>
                    {['Use high quality audio', 'Clear speech works best', 'Avoid heavy background noise'].map(t => (
                      <div key={t} className="tip-row">
                        <CheckCircle size={13} className="tip-check" /> {t}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

      </main>
    </div>
  );
}

export default App;