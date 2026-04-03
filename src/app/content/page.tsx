'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { useAdminSession } from '@/lib/admin';
import { DailyContentRow } from '@/lib/types';

type ContentDraft = {
  contentDate: string;
  phrase: string;
  subPhrase: string;
  description: string;
  rewardTitle: string;
  rewardArtist: string;
  rewardVideoId: string;
  isPublished: boolean;
};

const EMPTY_DRAFT: ContentDraft = {
  contentDate: new Date().toISOString().slice(0, 10),
  phrase: '',
  subPhrase: '',
  description: '',
  rewardTitle: '',
  rewardArtist: '',
  rewardVideoId: '',
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
      phrase: row.phrase,
      subPhrase: row.sub_phrase,
      description: row.description,
      rewardTitle: row.reward_title ?? '',
      rewardArtist: row.reward_artist ?? '',
      rewardVideoId: row.reward_video_id ?? '',
      isPublished: row.is_published,
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

    const hasAnyRewardField = Boolean(
      draft.rewardTitle.trim() || draft.rewardArtist.trim() || draft.rewardVideoId.trim()
    );
    const hasCompleteReward = Boolean(
      draft.rewardTitle.trim() && draft.rewardArtist.trim() && draft.rewardVideoId.trim()
    );

    if (hasAnyRewardField && !hasCompleteReward) {
      setMessage('남자의 노래는 제목, 아티스트, 유튜브 영상 ID를 함께 채워야 합니다.');
      return;
    }

    setBusy(true);
    setMessage(null);

    const payload = {
      content_date: draft.contentDate,
      phrase: draft.phrase.trim(),
      sub_phrase: draft.subPhrase.trim(),
      description: draft.description.trim(),
      reward_title: draft.rewardTitle.trim() || null,
      reward_artist: draft.rewardArtist.trim() || null,
      reward_video_id: draft.rewardVideoId.trim() || null,
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
      description="날짜별 메인 문구, 서브 문구, 설명, 당일 유튜브를 저장하고 게시 여부를 제어합니다."
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

            <label className="field-block">
              <span className="field-label">SONG TITLE</span>
              <input
                className="field-input"
                value={draft.rewardTitle}
                onChange={(event) => setDraft((current) => ({ ...current, rewardTitle: event.target.value }))}
                placeholder="예: Remember the Name"
              />
            </label>

            <label className="field-block">
              <span className="field-label">SONG ARTIST</span>
              <input
                className="field-input"
                value={draft.rewardArtist}
                onChange={(event) => setDraft((current) => ({ ...current, rewardArtist: event.target.value }))}
                placeholder="예: Fort Minor"
              />
            </label>

            <label className="field-block field-block-full">
              <span className="field-label">YOUTUBE VIDEO ID</span>
              <input
                className="field-input"
                value={draft.rewardVideoId}
                onChange={(event) => setDraft((current) => ({ ...current, rewardVideoId: event.target.value }))}
                placeholder="예: VDvr08sCPOc"
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
                    <h4 className="list-card-title">{row.phrase}</h4>
                  </div>
                  <span className={`status-pill ${row.is_published ? 'status-pill-live' : ''}`}>
                    {row.is_published ? '게시중' : '비공개'}
                  </span>
                </div>
                {row.sub_phrase ? <p className="list-card-meta">{row.sub_phrase}</p> : null}
                <p className="list-card-body">{row.description}</p>
                <p className="list-card-meta">정답 문구: {row.phrase}</p>
                {row.reward_video_id ? (
                  <p className="list-card-meta">
                    남자의 노래: {[row.reward_title, row.reward_artist].filter(Boolean).join(' · ')} ({row.reward_video_id})
                  </p>
                ) : null}
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
