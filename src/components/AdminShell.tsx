'use client';

import Link from 'next/link';
import { ReactNode } from 'react';

import { AdminSessionState } from '@/lib/types';

type AdminShellProps = {
  title: string;
  description: string;
  currentPath: '/manual' | '/content' | '/members' | '/products' | '/community';
  sessionState: AdminSessionState;
  onLogout: () => void;
  children: ReactNode;
};

const NAV_ITEMS = [
  { href: '/manual', label: '수동 미션 관리' },
  { href: '/content', label: '콘텐츠 파이프라인' },
  { href: '/members', label: '회원 리드' },
  { href: '/products', label: '상품 관리' },
  { href: '/community', label: '커뮤니티 관리' },
] as const;

function renderStateMessage(state: AdminSessionState, currentPath: string) {
  // 상품 및 커뮤니티 페이지는 일반 회원/방문자도 볼 수 있도록 허용
  if (currentPath === '/products' || currentPath === '/community') {
    return null;
  }

  switch (state.status) {
    case 'loading':
      return {
        title: '관리자 세션 확인 중',
        body: 'Supabase 세션과 admin 권한을 확인하고 있습니다.',
      };
    case 'missing':
      return {
        title: '환경 변수 필요',
        body: 'NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 먼저 넣어야 합니다.',
      };
    case 'forbidden':
      return {
        title: '관리자 권한 없음',
        body: `${state.email} 계정은 admin 역할이 아닙니다. Supabase의 profiles.role을 admin으로 올려야 합니다.`,
      };
    case 'unauthenticated':
      return {
        title: '로그인 필요',
        body: '관리자 계정으로 다시 로그인해야 합니다.',
      };
    default:
      return null;
  }
}

export function AdminShell({
  title,
  description,
  currentPath,
  sessionState,
  onLogout,
  children,
}: AdminShellProps) {
  const stateMessage = renderStateMessage(sessionState, currentPath);

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand-block">
          <p className="brand-kicker">MANSALARM SERVER</p>
          <h1 className="brand-title">BLACK / GOLD OPS</h1>
          <p className="brand-copy">
            앱용 오늘 콘텐츠, 숏폼 렌더 큐, 고객 리드, 남자의 상품을 한 화면에서 운영하는 관리자 웹입니다.
          </p>
        </div>

        <nav className="nav-list">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${item.href === currentPath ? 'nav-item-active' : ''}`}
            >
              <span>{item.label}</span>
              <span className="nav-arrow">›</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <p className="sidebar-status-label">ADMIN</p>
          <p className="sidebar-status-value">
            {sessionState.status === 'ready' ? sessionState.email : 'session pending'}
          </p>
          <button type="button" className="ghost-button" onClick={onLogout}>
            로그아웃
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="page-header">
          <div>
            <p className="page-kicker">OPERATIONS</p>
            <h2 className="page-title">{title}</h2>
            <p className="page-description">{description}</p>
          </div>
        </header>

        {stateMessage ? (
          <section className="state-card">
            <p className="state-kicker">ACCESS</p>
            <h3 className="state-title">{stateMessage.title}</h3>
            <p className="state-body">{stateMessage.body}</p>
          </section>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
