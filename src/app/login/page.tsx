'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AdminPromoteSqlPanel } from '@/components/AdminPromoteSqlPanel';
import { hasSupabaseEnv } from '@/lib/env';
import { getSupabaseBrowserClient } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [promoteEmail, setPromoteEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setPromoteEmail(null);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.session.user.id)
        .maybeSingle();

      if (profile?.role === 'admin') {
        router.replace('/content');
        return;
      }

      setPromoteEmail(data.session.user.email ?? '');
      setMessage('로그인된 계정은 관리자가 아닙니다. SQL로 role을 admin으로 올린 뒤 새로고침하세요.');
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
    setPromoteEmail(null);

    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    const uid = signInData.user?.id;
    if (!uid) {
      setMessage('로그인 응답에 사용자 정보가 없습니다.');
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', uid)
      .maybeSingle();

    if (profileError) {
      setMessage(profileError.message);
      return;
    }

    if (profile?.role !== 'admin') {
      setPromoteEmail(signInData.user.email ?? email.trim());
      setMessage('로그인은 되었지만 관리자 권한이 없습니다. 아래 SQL을 실행한 뒤 다시 시도하세요.');
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

        {message ? <div className="inline-banner inline-banner-warning">{message}</div> : null}

        {promoteEmail ? <AdminPromoteSqlPanel email={promoteEmail} /> : null}

        <button type="button" className="primary-button" onClick={handleLogin} disabled={busy}>
          {busy ? '로그인 중...' : '관리자 로그인'}
        </button>

        <p className="login-footnote">
          계정이 없으면 먼저 등록한 뒤, SQL로 <code className="inline-code">profiles.role</code>을{' '}
          <code className="inline-code">admin</code>으로 올려 주세요.
        </p>

        <p className="login-nav">
          <Link href="/register" className="login-nav-link">
            운영 계정 회원 등록
          </Link>
        </p>
      </div>
    </div>
  );
}
