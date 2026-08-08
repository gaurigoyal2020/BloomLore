import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { AlertCircle, Check, Info } from 'lucide-react';
import Mascot from './Mascot';
import { getLessons } from './api';

function PlanPage() {
  const { session } = useOutletContext();
  const [lessons, setLessons] = useState(null); // null = still loading
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    getLessons(session.access_token)
      .then((data) => { if (!cancelled) setLessons(data); })
      .catch((err) => { if (!cancelled) setError(err.message); });

    return () => { cancelled = true; };
  }, [session.access_token]);

  const activeUploads = lessons?.length ?? 0;
  const totalWords = lessons?.reduce((sum, l) => sum + (l.word_count ?? 0), 0) ?? 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            My Plan
            <span className="title-icon" aria-hidden="true"> 💎</span>
          </h1>
          <p className="page-sub">Your current usage and available tiers</p>
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
        <p className="field-hint">Loading your plan…</p>
      )}

      {lessons !== null && (
        <>
          <div className="settings-card" style={{ maxWidth: 460 }}>
            <div className="settings-title">Free Plan</div>

            <div className="stats-card" style={{ padding: '1rem 1.1rem', gap: '1.5rem' }}>
              <div className="stat-item">
                <span className="stat-label">Active Uploads</span>
                <span className="stat-value">{activeUploads}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Words Transcribed</span>
                <span className="stat-value">{totalWords.toLocaleString()}</span>
              </div>
            </div>

            <p className="field-hint" style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              Plans are priced by transcription minutes, but minute-level
              usage tracking isn&rsquo;t wired up on our end yet — so the
              numbers above are what we can show you for real today,
              not your monthly minute total.
            </p>
          </div>

          <h2 className="features-title" style={{ marginTop: '1.75rem' }}>Available Tiers</h2>

          <div className="plan-tiers" style={{ marginTop: '0.75rem' }}>
            <div className="plan-tier-card plan-tier-card--current">
              <div className="plan-tier-head">
                <span className="plan-tier-name">Free</span>
                <span className="plan-tier-badge">Current</span>
              </div>
              <div className="plan-tier-price">$0 <span>/ forever</span></div>
              <div className="plan-tier-features">
                <span className="plan-tier-feature"><Check size={14} color="var(--green)" /> 30 transcription minutes / month</span>
                <span className="plan-tier-feature"><Check size={14} color="var(--green)" /> No watermark — clean SRT/VTT exports</span>
                <span className="plan-tier-feature"><Check size={14} color="var(--green)" /> 24-hour video storage</span>
                <span className="plan-tier-feature"><Check size={14} color="var(--green)" /> Resets monthly, no rollover</span>
              </div>
              <button className="btn-tier btn-tier--current" disabled>Your Current Plan</button>
            </div>

            <div className="plan-tier-card">
              <div className="plan-tier-head">
                <span className="plan-tier-name">Pro</span>
                <span className="plan-tier-badge">Coming Soon</span>
              </div>
              <div className="plan-tier-price">$9 <span>/ month</span></div>
              <div className="plan-tier-features">
                <span className="plan-tier-feature"><Check size={14} color="var(--green)" /> 150 transcription minutes / month included</span>
                <span className="plan-tier-feature"><Check size={14} color="var(--green)" /> $0.08/min pay-as-you-go after that</span>
                <span className="plan-tier-feature"><Check size={14} color="var(--green)" /> No watermark — clean SRT/VTT exports</span>
                <span className="plan-tier-feature"><Check size={14} color="var(--green)" /> Same 24-hour video storage as Free</span>
              </div>
              <button className="btn-tier btn-tier--waitlist" disabled>Billing isn&rsquo;t live yet</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default PlanPage;