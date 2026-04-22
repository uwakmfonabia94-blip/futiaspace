/**
 * FutiaSpace — js/supabase.js
 * Single source of truth for the Supabase client.
 * Every other module imports `supabase` from here — never call
 * createClient() anywhere else in the codebase.
 *
 * ─── SETUP INSTRUCTIONS ──────────────────────────────────────
 * 1. Go to your Supabase dashboard → Project Settings → API
 * 2. Copy "Project URL"  → paste as SUPABASE_URL below
 * 3. Copy "anon / public" key → paste as SUPABASE_ANON_KEY below
 * 4. Do NOT commit real keys to GitHub. Add to .env or Vercel env vars.
 * ──────────────────────────────────────────────────────────────
 */

// ── Replace these two values before deploying ─────────────────
const SUPABASE_URL      = 'https://ahvuhiocbtkqqulbziql.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFodnVoaW9jYnRrcXF1bGJ6aXFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4ODA4ODgsImV4cCI6MjA5MjQ1Njg4OH0.FaR8ecAWpEbcTHEv3q6GG4gTHWP0RsmKti5vUA1b6V8';
// ──────────────────────────────────────────────────────────────

// Supabase UMD is loaded via CDN script tag before this module runs.
// window.supabase is guaranteed available here.
const { createClient } = window.supabase;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    /**
     * persistSession: true  — keeps the user logged in across browser restarts.
     * Session is stored in localStorage under `storageKey`.
     * Supabase auto-refreshes the token before it expires — the user is
     * never logged out unless they explicitly call supabase.auth.signOut().
     */
    persistSession    : true,
    autoRefreshToken  : true,

    /**
     * detectSessionInUrl: true — required for the password-reset flow.
     * When a user clicks the reset link Supabase emails, they land on the
     * site with #access_token=...&type=recovery in the URL hash.
     * Setting this to true tells Supabase to automatically read that token,
     * establish the session, and fire the PASSWORD_RECOVERY auth event.
     */
    detectSessionInUrl: true,

    /**
     * Custom storage key so this project never clashes with another
     * Supabase project that might also be running under the same origin.
     */
    storageKey        : 'futiaspace_auth',
  },
});