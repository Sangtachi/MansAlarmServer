import { createClient } from '@supabase/supabase-js';

import { config } from './config.mjs';

if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the worker.');
}

export const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
