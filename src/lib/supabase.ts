'use client';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { adminEnv, hasSupabaseEnv } from './env';

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient() {
  if (!hasSupabaseEnv()) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(adminEnv.supabaseUrl, adminEnv.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }

  return browserClient;
}
