/**
 * Web Supabase client — no RN URL polyfill needed (browsers have URL natively).
 * Same anon-key, no-session setup as the native client.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './sync-config';

let client: SupabaseClient | null = null;

/** Lazily created on first sync; never touched when sync is unconfigured. */
export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
