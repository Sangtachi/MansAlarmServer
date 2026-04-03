'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { AdminPromoteSqlPanel } from '@/components/AdminPromoteSqlPanel';
import { hasSupabaseEnv } from '@/lib/env';
import { getSupabaseBrowserClient } from '@/lib/supabase';

export default function RegisterPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);

  const handleRegister = async () => {
    if (!supabase) {
      setMessage('Supabase 환경 변수가 없어 등록할 수 없습니다.');
      return;
    }

    const trimmed = email.trim();
    if (!trimmed || !password.trim()) {
      setMessage('이메일과 비밀번호를 입력해 주세요.');
      return;
    }

    if (password.length < 6) {
      setMessage('비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    if (password !== password2) {
      setMessage('비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setBusy(true);
    setMessage(null);
    setSuccessEmail(null);
    setNeedsEmailConfirm(false);

    const redirect = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;

    const { data, error } = await supabase.auth.signUp({
      email: trimmed,
      password,
      options: redirect ? { emailRedirectTo: redirect } : undefined,
    });

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSuccessEmail(trimmed);
    setNeedsEmailConfirm(!data.session);
    setPassword('');
    setPassword2('');
  };

  const showForm = !successEmail;

  return (
    <div className="login-page">
      <div className="login-card">
        <p className="page-kicker">MANSALARM SERVER</p>
        <h1 className="login-title">운영 계정 등록</h1>
        <p className="login-copy">
          Supabase Auth에 계정이 만들어지며, 자동으로 <code className="inline-code">profiles</code> 행이
          생성됩니다. 관리자 화면을 쓰려면 아래 SQL로 <code className="inline-code">role</code>을{' '}
          <code className="inline-code">admin</code>으로 올려야 합니다.
        </p>

        {!hasSupabaseEnv() ? (
          <div className="inline-banner inline-banner-warning">
            `.env.local` 또는 Vercel 환경 변수에 Supabase URL과 anon key를 넣어 주세요.
          </div>
        ) : null}

        {showForm ? (
          <>
            <label className="field-block">
              <span className="field-label">EMAIL</span>
              <input
                className="field-input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>

            <label className="field-block">
              <span className="field-label">PASSWORD</span>
              <input
                className="field-input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="6자 이상"
                autoComplete="new-password"
              />
            </label>

            <label className="field-block">
              <span className="field-label">PASSWORD 확인</span>
              <input
                className="field-input"
                type="password"
                value={password2}
                onChange={(event) => setPassword2(event.target.value)}
                placeholder="비밀번호 다시 입력"
                autoComplete="new-password"
              />
            </label>

            {message ? <div className="inline-banner inline-banner-warning">{message}</div> : null}

            <button type="button" className="primary-button" onClick={handleRegister} disabled={busy}>
              {busy ? '등록 중...' : '회원 등록'}
            </button>
          </>
        ) : (
          <>
            <div className="inline-banner">
              {needsEmailConfirm
                ? '등록되었습니다. 이메일로 온 링크를 눌러 인증한 뒤, SQL을 실행하고 로그인하세요.'
                : '등록되었습니다. 아래 SQL 실행 후 로그인하세요.'}
            </div>
            {successEmail ? <AdminPromoteSqlPanel email={successEmail} /> : null}
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setSuccessEmail(null);
                setNeedsEmailConfirm(false);
              }}
            >
              다른 이메일로 다시 등록
            </button>
          </>
        )}

        <p className="login-nav">
          <Link href="/login" className="login-nav-link">
            로그인으로 돌아가기
          </Link>
        </p>
      </div>
    </div>
  );
}
