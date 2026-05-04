import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { adminEnv, hasSupabaseEnv } from '@/lib/env';

export async function GET() {
  let databaseReachable = false;

  if (hasSupabaseEnv()) {
    const supabase = createClient(adminEnv.supabaseUrl, adminEnv.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { error } = await supabase.from('daily_contents').select('id').limit(1);
    databaseReachable = !error;
  }

  return NextResponse.json({
    ok: true,
    service: 'MansAlarmServer admin',
    timestamp: new Date().toISOString(),
    supabaseConfigured: hasSupabaseEnv(),
    databaseReachable,
  });
}
