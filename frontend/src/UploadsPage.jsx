import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Upload, CheckCircle, AlertCircle, Captions, ChevronDown,
} from 'lucide-react';
import ResultsPage from './ResultsPage';
import ProcessingPage from './ProcessingPage';
import Mascot from './Mascot';
import { supabase } from './supabaseClient';
import { submitUpload, getJobStatus } from './api';

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

const STAGE_PROGRESS = {
  queued: 15,
  converting: 30,
  transcribing: 55,
  translating: 78,
  'building-subtitles': 92,
  uploading: 97,
  done: 100,
};
const POLL_INTERVAL_MS = 2000;

function UploadsPage() {
  const { session, setMascotState } = useOutletContext();

  const [file,       setFile]       = useState(null);
  const [targetLang, setTargetLang] = useState('en');
  const [uploading,  setUploading]  = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [result,     setResult]     = useState(null);
  const [error,      setError]      = useState(null);
  const [dragActive, setDragActive] = useState(false);

  // Keeps the sidebar mascot honest about what's actually happening on
  // this page — same logic that used to live directly in App.jsx's JSX
  // before the upload flow was split into its own route/component.
  useEffect(() => {
    setMascotState(uploading ? 'active' : result ? 'done' : 'idle');
    return () => setMascotState('idle');
  }, [uploading, result, setMascotState]);

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

  /* ── Upload ── */
  const handleUpload = async () => {
    if (!file) { setError('Please select a video file'); return; }

    setUploading(true); setError(null); setProgress(0);

    try {
      const { jobId } = await submitUpload(file, targetLang, session.access_token, (pct) => {
        setProgress((prev) => Math.max(prev, Math.round(pct * 0.15)));
      });

      await pollUntilDone(jobId);
    } catch (err) {
      setError(err.message || 'Failed to process video. Please try again.');
      setUploading(false);
      setProgress(0);
    }
  };

  /* ── Poll a job until it's complete or errors out ── */
  const pollUntilDone = (jobId) => {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            reject(new Error('Your session expired — please log in again.'));
            return;
          }

          const status = await getJobStatus(jobId, data.session.access_token);

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

  /* ════ STATE 1 — Processing ════ */
  if (uploading) {
    return <ProcessingPage progress={progress} file={file} onBackground={() => {}} />;
  }

  /* ════ STATE 2 — Results ════ */
  if (result) {
    return (
      <ResultsPage
        result={result}
        file={file}
        targetLang={targetLang}
        onReset={resetForm}
      />
    );
  }

  /* ════ STATE 3 — Upload page ════ */
  return (
    <>
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

      <div className="upload-grid">
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
  );
}

export default UploadsPage;