import { createClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    __MEALMIND_CONFIG__?: { supabaseUrl: string; supabaseAnonKey: string };
  }
}

// Public client config. In production the server provides it at runtime via /config.js,
// so the same image works anywhere; in development it can come from frontend/.env.
// The anon key is meant to be public; row level security protects the data.
const runtime = window.__MEALMIND_CONFIG__;
const url = runtime?.supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL;
const anonKey = runtime?.supabaseAnonKey ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing Supabase config: set SUPABASE_URL and SUPABASE_ANON_KEY on the server, or VITE_SUPABASE_* in frontend/.env.');
}

export const supabase = createClient(url, anonKey);
