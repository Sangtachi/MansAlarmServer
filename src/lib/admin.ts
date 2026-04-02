'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AdminSessionState } from './types';
import { getSupabaseBrowserClient } from './supabase';

export function useAdminSession() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [state, setState] = useState<AdminSessionState>(() => (supabase ? { status: 'loading' } : { status: 'missing' }));

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

    if (error || profile?.role !== 'admin') {
      setState({
        status: 'forbidden',
        email: session.user.email ?? '',
      });
      return;
    }

    setState({
      status: 'ready',
      email: profile.email || session.user.email || '',
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

  return {
    supabase,
    state,
    refresh,
    signOut,
  };
}
