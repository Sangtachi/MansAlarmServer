import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

import { adminEnv, hasSupabaseEnv } from './env';

export type AdminRouteContext = {
  supabase: SupabaseClient;
  user: User;
  email: string;
};

export async function getAdminRouteContext(request: NextRequest): Promise<AdminRouteContext> {
  if (!hasSupabaseEnv()) {
    throw new Error('Supabase environment variables are missing.');
  }

  const authorization = request.headers.get('authorization')?.trim() || '';
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    throw new Error('Authorization bearer token is required.');
  }

  const accessToken = authorization.slice(7).trim();
  if (!accessToken) {
    throw new Error('Authorization bearer token is required.');
  }

  const supabase = createClient(adminEnv.supabaseUrl, adminEnv.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const userResult = await supabase.auth.getUser(accessToken);
  if (userResult.error || !userResult.data.user) {
    throw new Error('Invalid admin session.');
  }

  const user = userResult.data.user;
  const profileResult = await supabase
    .from('profiles')
    .select('email, role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileResult.error || profileResult.data?.role !== 'admin') {
    throw new Error('Admin role is required.');
  }

  return {
    supabase,
    user,
    email: profileResult.data.email || user.email || '',
  };
}
