'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { useAdminSession } from '@/lib/admin';
import { DailyContentRow } from '@/lib/types';

type ContentDraft = {
  contentDate: string;
  headline: string;
  description: string;
  typingTarget: string;
  isPublished: boolean;
};

const EMPTY_DRAFT: ContentDraft = {
  contentDate: new Date().toISOString().slice(0, 10),
  headline: '',
  description: '',
  typingTarget: '',
  isPublished: false,
};

export default function ContentPage() {
  const { supabase, state, signOut } = useAdminSession();
  const [rows, setRows] = useState<DailyContentRow[]>([]);
  const [draft, setDraft] = useState<ContentDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    if (!supabase || state.status !== 'ready') {
      return;
    }

    const { data, error } = await supabase
      .from('daily_contents')
      .select('*')
      .order('content_date', { ascending: false })
      .limit(45);

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

  const resetDraft = () => {
    setDraft({
      ...EMPTY_DRAFT,
      contentDate: new Date().toISOString().slice(0, 10),
    });
    setEditingId(null);
  };

  const handleEdit = (row: DailyContentRow) => {
    setEditingId(row.id);
    setDraft({
      contentDate: row.content_date,
      headline: row.headline,
      description: row.description,
      typingTarget: row.typing_target,
      isPublished: row.is_published,
    });
    setMessage(null);
  };

  const handleSave = async () => {
    if (!supabase || state.status !== 'ready') {
      return;
    }

    if (!draft.contentDate || !draft.headline.trim() || !draft.description.trim() || !draft.typingTarget.trim()) {
      setMessage('날짜, 큰 제목, 설명, 타이핑 기준 문구를 모두 채워야 합니다.');
      return;
    }

    setBusy(true);
    setMessage(null);

    const payload = {
      content_date: draft.contentDate,
      headline: draft.headline.trim(),
      description: draft.description.trim(),
      typing_target: draft.typingTarget.trim(),
      is_published: draft.isPublished,
    };

    const result = editingId
      ? await supabase.from('daily_contents').update(payload).eq('id', editingId)
      : await supabase.from('daily_contents').insert(payload);

    setBusy(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    resetDraft();
    setMessage(editingId ? '오늘 문구를 수정했습니다.' : '오늘 문구를 등록했습니다.');
    await loadRows();
  };

  const handleDelete = async (id: string) => {
    if (!supabase || state.status !== 'ready') {
      return;
    }

    setBusy(true);
    const { error } = await supabase.from('daily_contents').delete().eq('id', id);
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (editingId === id) {
      resetDraft();
    }

    setMessage('문구를 삭제했습니다.');
    await loadRows();
  };

  const publishedCount = useMemo(() => rows.filter((row) => row.is_published).length, [rows]);

  return (
    <AdminShell
      title="오늘 문구 운영"
      description="날짜별 큰 제목, 설명, 타이핑 기준 문구를 저장하고 게시 여부를 제어합니다."
      currentPath="/content"
      sessionState={state}
      onLogout={() => signOut().catch(() => undefined)}
    >
      <div className="page-grid">
        <section className="panel panel-form">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">DAILY COPY</p>
              <h3 className="panel-title">{editingId ? '오늘 문구 수정' : '오늘 문구 등록'}</h3>
            </div>
            <button type="button" className="ghost-button" onClick={resetDraft}>
              초기화
            </button>
          </div>

          <div className="field-grid">
            <label className="field-block">
              <span className="field-label">DATE</span>
              <input
                className="field-input"
                type="date"
                value={draft.contentDate}
                onChange={(event) => setDraft((current) => ({ ...current, contentDate: event.target.value }))}
              />
            </label>

            <label className="field-block">
              <span className="field-label">HEADLINE</span>
              <input
                className="field-input"
                value={draft.headline}
                onChange={(event) => setDraft((current) => ({ ...current, headline: event.target.value }))}
                placeholder="예: 행증자명"
              />
            </label>

            <label className="field-block field-block-full">
              <span className="field-label">DESCRIPTION</span>
              <textarea
                className="field-textarea"
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder="설명 문구"
                rows={4}
              />
            </label>

            <label className="field-block field-block-full">
              <span className="field-label">TYPING TARGET</span>
              <input
                className="field-input"
                value={draft.typingTarget}
                onChange={(event) => setDraft((current) => ({ ...current, typingTarget: event.target.value }))}
                placeholder="알람 해제용 정답 문구"
              />
            </label>

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={draft.isPublished}
                onChange={(event) => setDraft((current) => ({ ...current, isPublished: event.target.checked }))}
              />
              <span>게시 상태로 저장</span>
            </label>
          </div>

          {message ? <div className="inline-banner">{message}</div> : null}

          <button type="button" className="primary-button" onClick={handleSave} disabled={busy}>
            {busy ? '저장 중...' : editingId ? '이 문구로 갱신' : '오늘 문구 저장'}
          </button>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">CALENDAR LIST</p>
              <h3 className="panel-title">등록된 날짜 문구</h3>
            </div>
            <div className="metric-pill">{publishedCount} published</div>
          </div>

          <div className="card-list">
            {rows.map((row) => (
              <article key={row.id} className="list-card">
                <div className="list-card-top">
                  <div>
                    <p className="list-card-date">{row.content_date}</p>
                    <h4 className="list-card-title">{row.headline}</h4>
                  </div>
                  <span className={`status-pill ${row.is_published ? 'status-pill-live' : ''}`}>
                    {row.is_published ? '게시중' : '비공개'}
                  </span>
                </div>
                <p className="list-card-body">{row.description}</p>
                <p className="list-card-meta">정답 문구: {row.typing_target}</p>
                <div className="card-actions">
                  <button type="button" className="ghost-button" onClick={() => handleEdit(row)}>
                    수정
                  </button>
                  <button type="button" className="danger-button" onClick={() => handleDelete(row.id)} disabled={busy}>
                    삭제
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
