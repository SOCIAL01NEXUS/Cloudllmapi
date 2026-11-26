/* ==========================================================================
   Study Buddy — Supabase client + small data helpers
   --------------------------------------------------------------------------
   1. Replace the two values below with YOUR project's values
      (Supabase dashboard → Project Settings → API).
   2. The anon / publishable key is SAFE to be public: all protection comes
      from Row Level Security (see sql/schema.sql).
   3. NEVER put the service_role key in any file of this website.
   ========================================================================== */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';

export const isConfigured =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL) &&
  !SUPABASE_URL.includes('YOUR-PROJECT-REF') &&
  !SUPABASE_ANON_KEY.includes('YOUR-ANON');

export const supabase = createClient(
  isConfigured ? SUPABASE_URL : 'https://placeholder.supabase.co',
  isConfigured ? SUPABASE_ANON_KEY : 'placeholder-key',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);

/** Throw if a Supabase response has an error, otherwise return its data. */
export function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

let profileCache = null;
export async function getProfile(force = false) {
  if (profileCache && !force) return profileCache;
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name, role, email')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error) throw error;
  profileCache = data;
  return data;
}

/** Local calendar date as YYYY-MM-DD (the student's own day, not UTC). */
export function localDateStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return localDateStr(new Date(y, m - 1, d + n));
}

export const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || '');
