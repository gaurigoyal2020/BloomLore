import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, HelpCircle, X, Monitor, Video } from 'lucide-react';
import Mascot from './Mascot';
import './ProcessingPage.css';

/* ─── Helpers ────────────────────────────────────────────────────── */
const fmtSec = (s) => {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `00:${m}:${sec}`;
};

const STEPS = [
  { id: 1, label: 'Upload',       short: 'Upload',       threshold: 0  },
  { id: 2, label: 'Transcribing', short: 'Transcribing', threshold: 20 },
  { id: 3, label: 'Aligning',     short: 'Aligning',     threshold: 50 },
  { id: 4, label: 'Generating',   short: 'Generating',   threshold: 72 },
  { id: 5, label: 'Finalizing',   short: 'Finalizing',   threshold: 90 },
];

const PIPELINE_STEPS = [
  { label: 'Transcribing Audio',    desc: 'Detecting speech and converting to text', threshold: 20 },
  { label: 'Aligning Words',        desc: 'Syncing text with video timeline',         threshold: 50 },
  { label: 'Generating Subtitles',  desc: 'Applying styles and formatting',           threshold: 72 },
  { label: 'Quality Check',         desc: 'Reviewing for accuracy',                   threshold: 88 },
  { label: 'Finalizing',            desc: 'Preparing your subtitles',                 threshold: 94 },
];

const FACTS = [
  'BloomLore uses advanced AI to deliver highly accurate subtitles in over 100 languages.',
  'Our AI can detect up to 97 languages automatically — no manual selection needed.',
  'Subtitles are synced frame-by-frame for perfect timing every time.',
  'You can edit, restyle, and export subtitles in SRT, VTT, ASS, and more.',
];

const getCurrentStep = (p) => STEPS.findLast(s => p >= s.threshold) || STEPS[0];
const getCurrentPipelineStep = (p) => PIPELINE_STEPS.findLast(s => p >= s.threshold) || PIPELINE_STEPS[0];

/* ─── Component ──────────────────────────────────────────────────── */
const ProcessingPage = ({ progress = 0, file, onBackground }) => {
  const [elapsed, setElapsed]       = useState(0);
  const [showFact, setShowFact]     = useState(true);
  const [factIdx]                   = useState(() => Math.floor(Math.random() * FACTS.length));
  const startRef                    = useRef(Date.now());

  // tick elapsed time
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const currentStep     = getCurrentStep(progress);
  const currentPipeline = getCurrentPipelineStep(progress);
  const estLeft         = Math.max(0, Math.round((elapsed / Math.max(progress, 1)) * (100 - progress)));
  const speed           = elapsed > 0 ? (progress / elapsed * 1.8).toFixed(1) : '—';
  const fileName        = file?.name?.replace(/\.[^.]+$/, '') || 'My Awesome Video';
  const fileSizeMB      = file?.size ? (file.size / (1024 * 1024)).toFixed(2) + ' MB' : '—';
  const isDone           = progress >= 100;

  return (
    <div className="pp-root">

      {/* ── Breadcrumb ── */}
      <nav className="pp-breadcrumb">
        <span className="pp-bc-link">Activity</span>
        <span className="pp-bc-sep">›</span>
        <span className="pp-bc-link">{fileName}</span>
        <span className="pp-bc-sep">›</span>
        <span className="pp-bc-cur">Processing</span>
      </nav>

      {/* ── Page Header ── */}
      <div className="pp-page-header">
        <div>
          <h1 className="pp-title">Processing Your Video <Sparkles size={18} className="pp-spark" /></h1>
          <p className="pp-sub">Hang tight! BloomLore is working its magic.</p>
        </div>
        <div className="pp-header-right">
          <Mascot size={52} state={isDone ? 'done' : 'active'} />
        </div>
      </div>

      {/* ── Body ── */}
      <div className="pp-body">

        {/* ═══ LEFT ═══ */}
        <div className="pp-left">

          {/* Main processing card */}
          <div className="pp-main-card">

            {/* Scene */}
            <div className="pp-scene" aria-hidden="true">
              <div className="pp-scene-sparkle">✦</div>
              <div className="pp-scene-star pp-s1">✦</div>
              <div className="pp-scene-star pp-s2">·</div>
              <div className="pp-scene-star pp-s3">✦</div>
              <div className="pp-hydrangea pp-h1">❋</div>
              <div className="pp-hydrangea pp-h2">❋</div>
              <div className="pp-hydrangea pp-h3">❋</div>
              <div className="pp-scene-suncat"><Mascot size={68} state={isDone ? 'done' : 'active'} /></div>
            </div>

            {/* Status */}
            <div className="pp-status-area">
              <div className="pp-status-label">{currentPipeline.label}</div>
              <div className="pp-status-desc">{currentPipeline.desc}…</div>

              <div className="pp-percent">{progress}<span className="pp-pct-sign">%</span></div>

              <div className="pp-bar-track">
                <div className="pp-bar-fill" style={{ width: `${progress}%` }}>
                  <div className="pp-bar-glow" />
                </div>
              </div>

              {/* Time stats */}
              <div className="pp-time-stats">
                <div className="pp-time-item">
                  <span className="pp-time-label">Elapsed Time</span>
                  <span className="pp-time-val">{fmtSec(elapsed)}</span>
                </div>
                <div className="pp-time-divider" />
                <div className="pp-time-item">
                  <span className="pp-time-label">Estimated Time Left</span>
                  <span className="pp-time-val">{fmtSec(estLeft)}</span>
                </div>
                <div className="pp-time-divider" />
                <div className="pp-time-item">
                  <span className="pp-time-label">Speed</span>
                  <span className="pp-time-val pp-speed">{speed}x</span>
                </div>
              </div>

              {/* Step pipeline */}
              <div className="pp-pipeline">
                {STEPS.map((step, i) => {
                  const done    = progress > step.threshold && step.id < currentStep.id;
                  const active  = step.id === currentStep.id;
                  const pending = !done && !active;
                  return (
                    <React.Fragment key={step.id}>
                      <div className="pp-pipeline-step">
                        <div className={`pp-step-circle ${done ? 'pp-step--done' : ''} ${active ? 'pp-step--active' : ''} ${pending ? 'pp-step--pending' : ''}`}>
                          {done ? '✓' : active ? <span className="pp-step-wave">〰</span> : step.id}
                        </div>
                        <div className="pp-step-label">{step.label}</div>
                        <div className={`pp-step-status ${done ? 'pp-step-status--done' : ''} ${active ? 'pp-step-status--active' : ''}`}>
                          {done ? 'Completed' : active ? 'In Progress' : 'Pending'}
                        </div>
                      </div>
                      {i < STEPS.length - 1 && (
                        <div className={`pp-pipeline-line ${done || active ? 'pp-pipeline-line--lit' : ''}`} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Did you know */}
            {showFact && (
              <div className="pp-fact-card">
                <Sparkles size={14} className="pp-fact-icon" />
                <div className="pp-fact-body">
                  <span className="pp-fact-head">Did you know?</span>
                  <span className="pp-fact-text">{FACTS[factIdx]}</span>
                </div>
                <button className="pp-fact-close" onClick={() => setShowFact(false)}><X size={14} /></button>
              </div>
            )}
          </div>

          {/* Process in Background */}
          <div className="pp-footer-actions">
            <button className="pp-btn-background" onClick={onBackground}>
              <Monitor size={15} /> Process in Background
            </button>
          </div>
        </div>

        {/* ═══ RIGHT ═══ */}
        <div className="pp-right">

          {/* Project Details */}
          <div className="pp-card">
            <div className="pp-card-title"><span className="pp-card-icon">🎬</span> Project Details</div>
            <div className="pp-proj-thumb">
              <Video size={30} className="pp-thumb-bg" color="#c4b5fd" />
            </div>
            <div className="pp-proj-name">{fileName} <span className="pp-proj-edit">✏</span></div>
            {[
              { k: 'Duration',   v: '—' },
              { k: 'Resolution', v: '—' },
              { k: 'File Size',  v: fileSizeMB },
              { k: 'Uploaded',   v: new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) + ' · ' + new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' }) },
            ].map(r => (
              <div key={r.k} className="pp-proj-row">
                <span className="pp-proj-key">{r.k}</span>
                <span className="pp-proj-val">{r.v}</span>
              </div>
            ))}
          </div>

          {/* Processing Steps — now expands to fill the space the removed
              Live Activity card used to take up (see pp-steps-card in CSS) */}
          <div className="pp-card pp-steps-card">
            <div className="pp-card-title"><span className="pp-card-icon">⚙️</span> Processing Steps</div>
            <div className="pp-steps-list">
              {PIPELINE_STEPS.map((s, i) => {
                const done   = progress > s.threshold && s.label !== currentPipeline.label && progress >= s.threshold + 10;
                const active = s.label === currentPipeline.label;
                return (
                  <div key={s.label} className={`pp-step-item ${active ? 'pp-step-item--active' : ''} ${done ? 'pp-step-item--done' : ''}`}>
                    <div className={`pp-step-dot ${active ? 'pp-step-dot--active' : ''} ${done ? 'pp-step-dot--done' : ''}`}>
                      {done ? '✓' : active ? '◈' : '○'}
                    </div>
                    <div className="pp-step-info">
                      <div className="pp-step-name">{s.label}</div>
                      <div className="pp-step-desc">{s.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ProcessingPage;