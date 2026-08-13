import { useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import {
  User, ShieldCheck, Sliders, CreditCard, Receipt, Lock, Bell,
  Sparkles, Check, AlertCircle, LogOut,
} from 'lucide-react';
import Mascot from './Mascot';
import { supabase } from './supabaseClient';
import './SettingsPage.css';

const LANGUAGES = [
  { code: 'en', name: 'English'    }, { code: 'es', name: 'Spanish'    },
  { code: 'fr', name: 'French'     }, { code: 'de', name: 'German'     },
  { code: 'hi', name: 'Hindi'      }, { code: 'zh', name: 'Chinese'    },
  { code: 'ja', name: 'Japanese'   }, { code: 'ko', name: 'Korean'     },
  { code: 'pt', name: 'Portuguese' }, { code: 'ru', name: 'Russian'    },
  { code: 'ar', name: 'Arabic'     }, { code: 'it', name: 'Italian'    },
];

const TABS = [
  { id: 'profile',      label: 'Profile',      icon: User,       soon: false },
  { id: 'account',      label: 'Account',      icon: ShieldCheck, soon: false },
  { id: 'preferences',  label: 'Preferences',  icon: Sliders,    soon: false },
  { id: 'subscription', label: 'Subscription', icon: CreditCard, soon: false },
  { id: 'billing',      label: 'Billing',      icon: Receipt,    soon: true  },
  { id: 'security',     label: 'Security',     icon: Lock,       soon: false },
  { id: 'notifications',label: 'Notifications',icon: Bell,       soon: true  },
];

function formatMemberSince(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Real, working: name is saved to Supabase user_metadata, member-since is the real account-created date. */
function ProfileTab({ session }) {
  const user = session.user;
  const [fullName, setFullName] = useState(user.user_metadata?.full_name ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const { error: updateError } = await supabase.auth.updateUser({ data: { full_name: fullName } });
    setSaving(false);
    if (updateError) { setError(updateError.message); return; }
    setSaved(true);
  };

  const displayName = fullName || user.email.split('@')[0];

  return (
    <div className="settings-card">
      <div className="settings-panel-head">
        <h2>Profile</h2>
        <p>Update your personal details.</p>
      </div>

      <div className="profile-head-row">
        <div className="profile-avatar-frame">
          <Mascot size={44} state="idle" />
        </div>
        <div>
          <div className="profile-head-name">{displayName}</div>
          <div className="profile-head-email">{user.email}</div>
        </div>
      </div>

      <form onSubmit={handleSave}>
        <div className="settings-field">
          <label htmlFor="full-name">Full Name</label>
          <input
            id="full-name"
            type="text"
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); setSaved(false); }}
            placeholder="Add your name"
          />
        </div>

        <div className="settings-info-row">
          <span className="settings-info-label">Email</span>
          <span className="settings-info-value">{user.email}</span>
        </div>
        <div className="settings-info-row">
          <span className="settings-info-label">Member Since</span>
          <span className="settings-info-value">{formatMemberSince(user.created_at)}</span>
        </div>

        {error && (
          <div className="alert-error" style={{ marginTop: '0.75rem' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="settings-save-row">
          <button type="submit" className="btn-generate" style={{ width: 'auto', padding: '0.55rem 1.3rem' }} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          {saved && <span className="settings-save-msg"><Check size={13} style={{ verticalAlign: -2 }} /> Saved</span>}
        </div>
      </form>

      <p className="field-hint" style={{ marginTop: '1rem' }}>
        Email changes aren&rsquo;t supported here yet — contact support if you need yours updated.
      </p>
    </div>
  );
}

/** Sign out is real. Account deletion isn't safe to do purely client-side, so it's an honest hand-off, not a fake button. */
function AccountTab({ session, onLogout }) {
  return (
    <div className="settings-card">
      <div className="settings-panel-head">
        <h2>Account</h2>
        <p>Manage your session and account access.</p>
      </div>

      <div className="settings-info-row">
        <span className="settings-info-label">Signed in as</span>
        <span className="settings-info-value">{session.user.email}</span>
      </div>

      <div className="settings-save-row" style={{ marginTop: '1rem' }}>
        <button type="button" className="settings-btn-secondary" onClick={onLogout}>
          <LogOut size={14} style={{ verticalAlign: -2, marginRight: 6 }} /> Sign Out
        </button>
      </div>

      <p className="field-hint" style={{ marginTop: '1.25rem', display: 'block' }}>
        Want your account deleted? We don&rsquo;t have a self-serve option
        for that yet — email support and we&rsquo;ll take care of it.
      </p>
    </div>
  );
}

/** Real: default target language is genuinely used by the Upload page. Theme is honestly locked — there's only one theme built. */
function PreferencesTab({ session }) {
  const [defaultLang, setDefaultLang] = useState(session.user.user_metadata?.default_target_lang ?? 'en');
  const [saved, setSaved] = useState(false);

  const handleChange = async (code) => {
    setDefaultLang(code);
    setSaved(false);
    const { error } = await supabase.auth.updateUser({ data: { default_target_lang: code } });
    if (!error) setSaved(true);
  };

  return (
    <div className="settings-card">
      <div className="settings-panel-head">
        <h2>Preferences</h2>
        <p>Customize your experience.</p>
      </div>

      <div className="field-group" style={{ marginBottom: '1.1rem' }}>
        <label className="field-label">Default Language</label>
        <div className="select-wrap">
          <select className="hy-select" value={defaultLang} onChange={(e) => handleChange(e.target.value)}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
        </div>
        <span className="field-hint">
          Pre-fills &ldquo;Translate To&rdquo; on the Uploads page. {saved && <span className="settings-save-msg">Saved</span>}
        </span>
      </div>

      <div className="field-group">
        <label className="field-label">Theme</label>
        <div className="select-wrap">
          <select className="hy-select" value="dark" disabled>
            <option value="dark">Dark</option>
          </select>
        </div>
        <span className="field-hint">Dark is the only theme available right now.</span>
      </div>
    </div>
  );
}

/** Deliberately thin — the full pricing/usage experience already lives on /plan; this just points there instead of duplicating it. */
function SubscriptionTab() {
  return (
    <div className="settings-card">
      <div className="settings-panel-head">
        <h2>Subscription</h2>
        <p>Your plan and usage.</p>
      </div>
      <div className="settings-sub-row">
        <div>
          <div className="settings-plan-badge">Free Plan</div>
          <p className="field-hint" style={{ marginTop: 8, display: 'block' }}>
            30 transcription minutes / month, no watermark exports.
          </p>
        </div>
        <Link to="/plan" className="btn-generate" style={{ width: 'auto', padding: '0.55rem 1.2rem', textDecoration: 'none' }}>
          View Plans &amp; Usage
        </Link>
      </div>
    </div>
  );
}

/** Real, working: Supabase Auth's password-update endpoint. */
function SecurityTab() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords don\u2019t match.'); return; }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) { setError(updateError.message); return; }
    setSaved(true);
    setPassword('');
    setConfirm('');
  };

  return (
    <div className="settings-card">
      <div className="settings-panel-head">
        <h2>Security</h2>
        <p>Change your password.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="settings-field">
          <label htmlFor="new-password">New Password</label>
          <input
            id="new-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
          />
        </div>
        <div className="settings-field">
          <label htmlFor="confirm-password">Confirm Password</label>
          <input
            id="confirm-password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={6}
          />
        </div>

        {error && (
          <div className="alert-error" style={{ marginBottom: '0.75rem' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="settings-save-row">
          <button type="submit" className="btn-generate" style={{ width: 'auto', padding: '0.55rem 1.3rem' }} disabled={saving}>
            {saving ? 'Updating…' : 'Update Password'}
          </button>
          {saved && <span className="settings-save-msg"><Check size={13} style={{ verticalAlign: -2 }} /> Password updated</span>}
        </div>
      </form>
    </div>
  );
}

function ComingSoonTab({ label, description }) {
  return (
    <div className="settings-card settings-soon">
      <div className="settings-soon-glyphs" aria-hidden="true">🌙 ✨ 🌙</div>
      <h2 style={{ margin: '0 0 6px', fontSize: '1rem', color: 'var(--text-primary)' }}>{label}</h2>
      <p className="field-hint" style={{ display: 'block' }}>{description}</p>
    </div>
  );
}

/** Logged-out visitors can reach /settings (it's a public route) but there's nothing account-shaped to show them. */
function SignedOutPrompt() {
  return (
    <div className="settings-card" style={{ textAlign: 'center', maxWidth: 420 }}>
      <Sparkles size={28} style={{ opacity: 0.5 }} />
      <p className="field-hint" style={{ display: 'block', margin: '0.75rem 0 1rem' }}>
        Sign in to manage your profile, preferences, and account settings.
      </p>
      <Link
        to="/login"
        className="btn-generate"
        style={{ width: 'auto', display: 'inline-flex', textDecoration: 'none', padding: '0.65rem 1.4rem' }}
      >
        Sign In
      </Link>
    </div>
  );
}

function SettingsPage() {
  const { session, onLogout } = useOutletContext();
  const [activeTab, setActiveTab] = useState('profile');

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Settings
            <span className="title-icon" aria-hidden="true"> ⚙️</span>
          </h1>
          <p className="page-sub">Manage your account and preferences</p>
        </div>
        <Mascot size={56} state="idle" className="header-mascot" />
      </div>

      {!session ? (
        <SignedOutPrompt />
      ) : (
        <div className="settings-layout">
          <nav className="settings-tabs">
            {TABS.map(({ id, label, icon: Icon, soon }) => (
              <button
                key={id}
                type="button"
                className={`settings-tab ${activeTab === id ? 'settings-tab--active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                <Icon size={16} />
                <span>{label}</span>
                {soon && <span className="settings-tab-soon">Soon</span>}
              </button>
            ))}
          </nav>

          <div>
            {activeTab === 'profile' && <ProfileTab session={session} />}
            {activeTab === 'account' && <AccountTab session={session} onLogout={onLogout} />}
            {activeTab === 'preferences' && <PreferencesTab session={session} />}
            {activeTab === 'subscription' && <SubscriptionTab />}
            {activeTab === 'billing' && (
              <ComingSoonTab label="Billing" description="Invoices and payment methods will show up here once Pro billing goes live." />
            )}
            {activeTab === 'security' && <SecurityTab />}
            {activeTab === 'notifications' && (
              <ComingSoonTab label="Notifications" description="Email and in-app notification preferences are coming soon." />
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default SettingsPage;