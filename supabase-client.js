import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

if (SUPABASE_URL.includes('YOUR_PROJECT_REF') || SUPABASE_PUBLISHABLE_KEY.includes('YOUR_SUPABASE')) {
  console.warn('Please configure Supabase in config.js before using the app.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
