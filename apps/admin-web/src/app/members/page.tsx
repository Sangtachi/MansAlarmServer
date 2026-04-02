'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { useAdminSession } from '@/lib/admin';
import { SignupLeadRow } from '@/lib/types';

export default function MembersPage() {
  const { supabase, state, signOut } = useAdminSession();
  const [rows, setRows] = useState<SignupLeadRow[]>([]);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    if (!supabase || state.status !== 'ready') {
      return;
    }

    const { data, error } = await supabase
      .from('signup_leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      setMessage(error.message);
      return;
    }

    setRows(data ?? []);
  }, [state.status, supabase]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadRows().catch(() => undefined);
    }, 0);

    return () => clearTimeout(timer);
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return rows;
    }

    return rows.filter((row) =>
      `${row.nickname} ${row.email} ${row.provider_preference ?? ''}`.toLowerCase().includes(normalized)
    );
  }, [query, rows]);

  return (
    <AdminShell
      title="회원 리드 관리"
      description="모바일에서 수집된 닉네임, 이메일, 선호 provider를 날짜순으로 확인합니다."
      currentPath="/members"
      sessionState={state}
      onLogout={() => signOut().catch(() => undefined)}
    >
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">LEADS</p>
            <h3 className="panel-title">회원가입 리드 목록</h3>
          </div>
          <div className="metric-pill">{filteredRows.length} rows</div>
        </div>

        <div className="search-row">
          <input
            className="field-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="이메일, 닉네임, provider 검색"
          />
        </div>

        {message ? <div className="inline-banner">{message}</div> : null}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>닉네임</th>
                <th>이메일</th>
                <th>Provider</th>
                <th>약관 동의</th>
                <th>생성일</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.nickname}</td>
                  <td>{row.email}</td>
                  <td>{row.provider_preference ?? '미선택'}</td>
                  <td>{new Date(row.accepted_terms_at).toLocaleString('ko-KR')}</td>
                  <td>{new Date(row.created_at).toLocaleString('ko-KR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
