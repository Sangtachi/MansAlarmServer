'use client';

import { useCallback, useState } from 'react';

import { buildPromoteAdminSql } from '@/lib/promote-admin-sql';

type Props = {
  email: string;
};

export function AdminPromoteSqlPanel({ email }: Props) {
  const sql = buildPromoteAdminSql(email);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [sql]);

  if (!email.trim()) {
    return null;
  }

  return (
    <div className="sql-panel">
      <p className="sql-panel-title">1) Supabase → SQL Editor에서 아래를 실행하세요</p>
      <p className="sql-panel-hint">
        이메일 인증을 켜 두었다면, 먼저 메일 링크로 인증한 뒤 실행하는 것이 안전합니다.
      </p>
      <pre className="code-block" tabIndex={0}>
        {sql}
      </pre>
      <button type="button" className="ghost-button sql-copy-button" onClick={handleCopy}>
        {copied ? '복사됨' : 'SQL 복사'}
      </button>
    </div>
  );
}
