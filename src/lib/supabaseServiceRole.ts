import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { adminEnv, hasSupabaseServiceEnv } from './env';

export function getServiceRoleSupabase(): SupabaseClient {
  if (!hasSupabaseServiceEnv()) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required for service operations.');
  }

  return createClient(adminEnv.supabaseUrl, adminEnv.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
