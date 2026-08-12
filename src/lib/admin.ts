'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AdminSessionState } from './types';
import { getSupabaseBrowserClient } from './supabase';
import {
  canAccessStaffConsole,
  canManageContent,
  canManageProducts,
  defaultLandingPath,
  type UserRole,
} from './roles';

export type StaffSessionState =
  | AdminSessionState
  | { status: 'ready'; email: string; role: UserRole };

export function useAdminSession() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [state, setState] = useState<StaffSessionState>(() =>
    supabase ? { status: 'loading' } : { status: 'missing' }
  );

  const refresh = useCallback(async () => {
    if (!supabase) {
      setState({ status: 'missing' });
      return;
    }

    const { data } = await supabase.auth.getSession();
    const session = data.session;

    if (!session) {
      setState({ status: 'unauthenticated' });
      return;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('email, role')
      .eq('id', session.user.id)
      .maybeSingle();

    const role = (profile?.role || null) as UserRole | null;

    if (error || !canAccessStaffConsole(role)) {
      setState({
        status: 'forbidden',
        email: session.user.email ?? '',
      });
      return;
    }

    setState({
      status: 'ready',
      email: profile?.email || session.user.email || '',
      role: role as UserRole,
    });
  }, [supabase]);

  useEffect(() => {
    const timer = setTimeout(() => {
      refresh().catch(() => {
        setState({ status: 'missing' });
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (state.status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [router, state.status]);

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.replace('/login');
  }, [router, supabase]);

  const role = state.status === 'ready' ? state.role : null;

  return {
    supabase,
    state,
    refresh,
    signOut,
    role,
    canManageContent: canManageContent(role),
    canManageProducts: canManageProducts(role),
    landingPath: defaultLandingPath(role),
  };
}
