'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { compareYmd, tomorrowYmd } from '@/lib/dailyContentCalendar';
import { useAdminSession } from '@/lib/admin';
import { normalizeRewardUrl } from '@/lib/rewardUrl';
import { DailyContentRow } from '@/lib/types';

type ContentDraft = {
  contentDate: string;
  phrase: string;
  subPhrase: string;
  description: string;
  rewardUrl: string;
};

function getInitialDraft(): ContentDraft {
  return {
    contentDate: tomorrowYmd(),
    phrase: '',
    subPhrase: '',
    description: '',
    rewardUrl: '',
  };
}

function displayRewardUrlForEdit(row: DailyContentRow): string {
  const u = row.reward_url?.trim();
  if (u) {
    return u;
  }
  const vid = row.reward_video_id?.trim();
  if (!vid) {
    return '';
  }
  if (/^https?:\/\//i.test(vid)) {
    return vid;
  }
  return `https://www.youtube.com/watch?v=${vid}`;
}

export default function ContentPage() {
  const { supabase, state, signOut } = useAdminSession();
  const [rows, setRows] = useState<DailyContentRow[]>([]);
  const [draft, setDraft] = useState<ContentDraft>(getInitialDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const minSelectableYmd = tomorrowYmd();
  const isLegacyContentDate = Boolean(
    editingId && draft.contentDate && compareYmd(draft.contentDate, minSelectableYmd) < 0,
  );

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
    setDraft(getInitialDraft());
    setEditingId(null);
  };

  const handleEdit = (row: DailyContentRow) => {
    setEditingId(row.id);
    setDraft({
      contentDate: row.content_date,
      phrase: row.phrase,
      subPhrase: row.sub_phrase,
      description: row.description,
      rewardUrl: displayRewardUrlForEdit(row),
    });
    setMessage(null);
  };

  const handleSave = async () => {
    if (!supabase || state.status !== 'ready') {
      return;
    }

    if (!draft.contentDate || !draft.phrase.trim() || !draft.description.trim()) {
      setMessage('날짜, 문구, 설명은 반드시 채워야 합니다.');
      return;
    }

    if (!isLegacyContentDate && compareYmd(draft.contentDate, minSelectableYmd) < 0) {
      setMessage('날짜는 내일(' + minSelectableYmd + ') 이후만 선택할 수 있습니다.');
      return;
    }

    const rewardRaw = draft.rewardUrl.trim();
    if (rewardRaw) {
      const normalized = normalizeRewardUrl(rewardRaw);
      if (!normalized) {
        setMessage('보상 링크는 http:// 또는 https:// 로 시작하는 URL이어야 합니다.');
        return;
      }
    }

    setBusy(true);
    setMessage(null);

    const normalizedReward = normalizeRewardUrl(draft.rewardUrl);

    const payload = {
      content_date: draft.contentDate,
      phrase: draft.phrase.trim(),
      sub_phrase: draft.subPhrase.trim(),
      description: draft.description.trim(),
      reward_url: normalizedReward,
      reward_title: null,
      reward_artist: null,
      reward_video_id: null,
      is_published: true,
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
    setMessage(editingId ? '문구를 수정했습니다.' : '문구를 등록했습니다.');
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

  const rowCountLabel = useMemo(() => `${rows.length}건`, [rows.length]);

  const listRewardLine = (row: DailyContentRow): string | null => {
    const u = row.reward_url?.trim();
    if (u) {
      return u;
    }
    const vid = row.reward_video_id?.trim();
    if (!vid) {
      return null;
    }
    if (/^https?:\/\//i.test(vid)) {
      return vid;
    }
    const legacyTitle = [row.reward_title, row.reward_artist].filter(Boolean).join(' · ');
    return legacyTitle ? `${legacyTitle} — https://www.youtube.com/watch?v=${vid}` : `https://www.youtube.com/watch?v=${vid}`;
  };

  return (
    <AdminShell
      title="오늘 문구 운영"
      description="날짜별 메인·서브 문구와 설명을 저장합니다. 신규 등록은 항상 내일 이후 날짜·즉시 게시이며, 보상은 단일 URL로 연결합니다."
      currentPath="/content"
      sessionState={state}
      onLogout={() => signOut().catch(() => undefined)}
    >
      <div className="page-grid">
        <section className="panel panel-form">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">DAILY COPY</p>
              <h3 className="panel-title">{editingId ? '문구 수정' : '문구 등록'}</h3>
            </div>
            <button type="button" className="ghost-button" onClick={resetDraft}>
              초기화
            </button>
          </div>

          <div className="field-grid">
            <label className="field-block field-block-full">
              <span className="field-label">DATE (신규는 내일 이후만)</span>
              {isLegacyContentDate ? (
                <p className="sql-panel-hint">{draft.contentDate} (과거 일정 — 날짜 변경 불가, 문구·설명·링크만 수정)</p>
              ) : (
                <input
                  className="field-input"
                  type="date"
                  min={minSelectableYmd}
                  value={draft.contentDate}
                  onChange={(event) => setDraft((current) => ({ ...current, contentDate: event.target.value }))}
                />
              )}
            </label>

            <label className="field-block">
              <span className="field-label">PHRASE</span>
              <input
                className="field-input"
                value={draft.phrase}
                onChange={(event) => setDraft((current) => ({ ...current, phrase: event.target.value }))}
                placeholder="예: 행증자명"
              />
            </label>

            <label className="field-block field-block-full">
              <span className="field-label">SUB PHRASE</span>
              <input
                className="field-input"
                value={draft.subPhrase}
                onChange={(event) => setDraft((current) => ({ ...current, subPhrase: event.target.value }))}
                placeholder="예: 行證自明 / 행동을 증명해라"
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
              <span className="field-label">보상 링크 (선택, https URL)</span>
              <input
                className="field-input"
                value={draft.rewardUrl}
                onChange={(event) => setDraft((current) => ({ ...current, rewardUrl: event.target.value }))}
                placeholder="예: https://www.youtube.com/watch?v=..."
              />
            </label>
          </div>

          {message ? <div className="inline-banner">{message}</div> : null}

          <button type="button" className="primary-button" onClick={handleSave} disabled={busy}>
            {busy ? '저장 중...' : editingId ? '이 문구로 갱신' : '문구 저장 (게시)'}
          </button>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">CALENDAR LIST</p>
              <h3 className="panel-title">등록된 날짜 문구</h3>
            </div>
            <div className="metric-pill">{rowCountLabel}</div>
          </div>

          <div className="card-list">
            {rows.map((row) => (
              <article key={row.id} className="list-card">
                <div className="list-card-top">
                  <div>
                    <p className="list-card-date">{row.content_date}</p>
                    <h4 className="list-card-title">{row.phrase}</h4>
                  </div>
                  <span className={`status-pill ${row.is_published ? 'status-pill-live' : ''}`}>
                    {row.is_published ? '게시중' : '비공개'}
                  </span>
                </div>
                {row.sub_phrase ? <p className="list-card-meta">{row.sub_phrase}</p> : null}
                <p className="list-card-body">{row.description}</p>
                <p className="list-card-meta">정답 문구: {row.phrase}</p>
                {(() => {
                  const reward = listRewardLine(row);
                  return reward ? <p className="list-card-meta">보상 링크: {reward}</p> : null;
                })()}
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
