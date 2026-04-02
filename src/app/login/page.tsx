'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { hasSupabaseEnv } from '@/lib/env';
import { getSupabaseBrowserClient } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.session.user.id)
        .maybeSingle();

      if (profile?.role === 'admin') {
        router.replace('/content');
      }
    }).catch(() => undefined);
  }, [router, supabase]);

  const handleLogin = async () => {
    if (!supabase) {
      setMessage('Supabase 환경 변수가 없어 로그인할 수 없습니다.');
      return;
    }

    if (!email.trim() || !password.trim()) {
      setMessage('이메일과 비밀번호를 먼저 입력해야 합니다.');
      return;
    }

    setBusy(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    router.replace('/content');
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <p className="page-kicker">MANSALARM SERVER</p>
        <h1 className="login-title">관리자 운영 화면 로그인</h1>
        <p className="login-copy">
          날짜별 오늘 문구와 회원 리드, 상품 상태를 관리하는 운영 화면입니다.
        </p>

        {!hasSupabaseEnv() ? (
          <div className="inline-banner inline-banner-warning">
            `.env.local`에 Supabase URL과 anon key를 먼저 넣어야 합니다.
          </div>
        ) : null}

        <label className="field-block">
          <span className="field-label">EMAIL</span>
          <input
            className="field-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@mensalarm.com"
          />
        </label>

        <label className="field-block">
          <span className="field-label">PASSWORD</span>
          <input
            className="field-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="비밀번호"
          />
        </label>

        {message ? <div className="inline-banner">{message}</div> : null}

        <button type="button" className="primary-button" onClick={handleLogin} disabled={busy}>
          {busy ? '로그인 중...' : '관리자 로그인'}
        </button>

        <p className="login-footnote">
          Supabase Auth에 계정을 만든 뒤, `profiles.role = admin`으로 올려야 접근이 가능합니다.
        </p>
      </div>
    </div>
  );
}
