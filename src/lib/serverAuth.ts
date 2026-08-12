import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

import { adminEnv, hasSupabaseEnv } from './env';
import { canManageContent, canManageProducts, type UserRole } from './roles';

export type AdminRouteContext = {
  supabase: SupabaseClient;
  user: User;
  email: string;
  role: UserRole;
};

async function getStaffContext(request: NextRequest): Promise<AdminRouteContext> {
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

  const role = (profileResult.data?.role || '') as UserRole;
  if (profileResult.error || !role) {
    throw new Error('Admin role is required.');
  }

  return {
    supabase,
    user,
    email: profileResult.data?.email || user.email || '',
    role,
  };
}

/** 콘텐츠 파이프라인 API: admin | operator */
export async function getAdminRouteContext(request: NextRequest): Promise<AdminRouteContext> {
  const ctx = await getStaffContext(request);
  if (!canManageContent(ctx.role)) {
    throw new Error('Admin role is required.');
  }
  return ctx;
}

/** 상품 API: admin | operator | seller */
export async function getProductAdminRouteContext(request: NextRequest): Promise<AdminRouteContext> {
  const ctx = await getStaffContext(request);
  if (!canManageProducts(ctx.role)) {
    throw new Error('Product manager role is required.');
  }
  return ctx;
}
