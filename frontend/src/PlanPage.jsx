import { useOutletContext, Link } from 'react-router-dom';
import { Check, Star, Mail } from 'lucide-react';
import Mascot from './Mascot';
import './PlanPage.css';

function PlanPage() {
  const { session } = useOutletContext();

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            My Plan
            <span className="title-icon" aria-hidden="true"> 💎</span>
          </h1>
          <p className="page-sub">Simple, transparent pricing for everyone</p>
        </div>
        <Mascot size={56} state="idle" className="header-mascot" />
      </div>

      {/* Real usage (active uploads, words transcribed) lives on the
          Dashboard now — this page is purely the pricing table, for
          both logged-in and logged-out visitors. */}
      <div className="plan-tiers plan-tiers--standalone">
        <div className={`plan-tier-card ${session ? 'plan-tier-card--current' : ''}`}>
          <div className="plan-tier-head">
            <span className="plan-tier-name">Free</span>
            {session && <span className="plan-tier-badge">Current</span>}
          </div>
          <div className="plan-tier-price">$0 <span>/ forever</span></div>
          <div className="plan-tier-features">
            <span className="plan-tier-feature"><Check size={14} color="var(--green)" /> 30 transcription minutes / month</span>
            <span className="plan-tier-feature"><Check size={14} color="var(--green)" /> No watermark — clean SRT/VTT exports</span>
            <span className="plan-tier-feature"><Check size={14} color="var(--green)" /> 24-hour video storage</span>
            <span className="plan-tier-feature"><Check size={14} color="var(--green)" /> Resets monthly, no rollover</span>
          </div>
          {session ? (
            <button className="btn-tier btn-tier--current" disabled>Your Current Plan</button>
          ) : (
            <Link to="/login" className="btn-tier btn-tier--cta">Sign In to Get Started</Link>
          )}
        </div>

        <div className="plan-tier-card plan-tier-card--popular">
          <div className="plan-ribbon"><Star size={11} /> Most Popular</div>
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

      <div className="plan-contact-row">
        <span>Need a custom plan for your team?</span>
        <a href="mailto:hello@bloomlore.app?subject=Team%20plan" className="link-view-all">
          <Mail size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Contact us
        </a>
      </div>
    </>
  );
}

export default PlanPage;