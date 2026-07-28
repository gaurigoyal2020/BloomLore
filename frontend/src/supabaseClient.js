import { createClient } from '@supabase/supabase-js';

// These come from your Supabase project settings (Project Settings > API Keys).
// VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY need to be set in
// your frontend .env file. The "publishable" key (Supabase's current name
// for what used to be called the "anon key") is safe to expose in
// frontend code — it's designed to be public, it does NOT grant admin
// access on its own. Its access is governed by Row Level Security (RLS)
// policies on whatever Postgres tables it touches — not relevant yet
// here since this app only uses Supabase Auth so far, not any table
// queries, but worth knowing once that changes later.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  // Fail loudly and immediately rather than letting auth calls fail
  // mysteriously later with a confusing network error.
  console.error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY — add them to frontend/.env'
  );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);