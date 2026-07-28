import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import Mascot from './Mascot';

/**
 * Shown instead of the main app whenever there's no logged-in user.
 * Handles both login and signup with one form — a `mode` toggle switches
 * which Supabase call gets made, since the form fields are identical.
 *
 * Email/password only for now (matches what was decided — OAuth
 * providers are an easy add later via Supabase Auth, but that's a
 * separate, later decision, not something to build speculatively now).
 */
const Auth = () => {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [signupMessage, setSignupMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSignupMessage(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        // No further action needed here — App.jsx listens for auth state
        // changes via supabase.auth.onAuthStateChange and will re-render
        // into the main app automatically once the session is set.
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
        // Depending on your Supabase project's email-confirmation
        // setting, a brand new signup may or may not be immediately
        // logged in. Telling the user to check their email covers both
        // cases without guessing which one your project uses.
        setSignupMessage('Account created — check your email to confirm, then log in.');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <Mascot size={40} state="idle" />
          <span className="logo-text">BloomLore</span>
        </div>

        <h1 className="auth-title">{mode === 'login' ? 'Log in' : 'Create an account'}</h1>

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="auth-label">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>

          <label className="auth-label">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {error && <p className="auth-error">{error}</p>}
          {signupMessage && <p className="auth-success">{signupMessage}</p>}

          <button type="submit" className="btn-primary auth-submit" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
          </button>
        </form>

        <button
          type="button"
          className="auth-switch"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setError(null);
            setSignupMessage(null);
          }}
        >
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
        </button>
      </div>
    </div>
  );
};

export default Auth;