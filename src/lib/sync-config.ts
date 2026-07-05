/**
 * Supabase connection config, read from EXPO_PUBLIC_* env (inlined at build
 * time, so must be accessed via static dot-notation). When either value is
 * missing the whole sync layer is inert and the app is purely local — that's
 * the default until a Supabase project is wired up.
 */

const RAW_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const RAW_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const SUPABASE_URL = typeof RAW_URL === 'string' ? RAW_URL.trim() : '';
export const SUPABASE_ANON_KEY = typeof RAW_KEY === 'string' ? RAW_KEY.trim() : '';

/** True only when both a URL and anon key are present — gates all sync UI + calls. */
export function isSyncConfigured(): boolean {
  return SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY.length > 0;
}
