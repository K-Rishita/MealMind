import { createClient } from '@supabase/supabase-js';

// Public client config (values come from frontend/.env, see .env.example).
// The anon key is meant to be public; row level security protects the data.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy frontend/.env.example to frontend/.env.');
}

export const supabase = createClient(url, anonKey);
