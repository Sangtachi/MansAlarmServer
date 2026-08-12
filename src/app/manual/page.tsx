'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { useAdminSession } from '@/lib/admin';
import { DailyContentRow } from '@/lib/types';
import { CONTENT_MEDIA_BUCKET, buildStoragePublicUrl, buildDefaultSocialCaption, WORKFLOW_STATUS_LABELS } from '@/lib/contentPipeline';
import { APP_PUBLISH_STATUS_LABELS } from '@/lib/contentOperations';
import { formatLocalYmd, tomorrowYmd } from '@/lib/dailyContentCalendar';

type ManualDraft = {
  contentDate: string;
  phrase: string;
  subPhrase: string;
  description: string;
  shortformVideoUrl: string;
  videoFile: File | null;
  posterFile: File | null;
  /** 수정 시: 같은 미션을 추가로 게시할 날짜들 (원본 날짜는 유지) */
  extraPublishDates: string[];
};

function getNextDate(rows: DailyContentRow[]): string {
  if (!rows || rows.length === 0) return tomorrowYmd();
  const latestDateStr = rows[0].content_date;
  const latestDate = new Date(latestDateStr);
  latestDate.setDate(latestDate.getDate() + 1);
  return latestDate.toISOString().split('T')[0];
}

function getInitialDraft(rows: DailyContentRow[] = []): ManualDraft {
  return {
    contentDate: getNextDate(rows),
    phrase: '',
    subPhrase: '',
    description: '',
    shortformVideoUrl: '',
    videoFile: null,
    posterFile: null,
    extraPublishDates: [],
  };
}

const ITEMS_PER_PAGE = 3;

export default function ManualContentPage() {
  const { supabase, state, signOut } = useAdminSession();
  const [rows, setRows] = useState<DailyContentRow[]>([]);
  const [draft, setDraft] = useState<ManualDraft>(() => getInitialDraft([]));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [extraDateInput, setExtraDateInput] = useState('');

  const loadRows = useCallback(async () => {
    if (!supabase || state.status !== 'ready') {
      return;
    }
    const { data, error } = await supabase
      .from('daily_contents')
      .select('*')
      .order('content_date', { ascending: false })
      .limit(300); // Load more to allow pagination

    if (error) {
      setMessage(error.message);
      return;
    }
    const loadedRows = data ?? [];
    setRows(loadedRows);
    
    // 수정 중이 아닐 때는 로드된 목록 기준으로 다음 날짜를 기본값으로 세팅
    setDraft((prev) => {
      // 이미 수동으로 입력 중인 데이터가 있다면 덮어쓰지 않음
      if (prev.phrase || prev.videoFile) return prev;
      return { ...prev, contentDate: getNextDate(loadedRows) };
    });
  }, [state.status, supabase, editingId]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const handleEdit = (row: DailyContentRow) => {
    setEditingId(row.id);
    setDraft({
      contentDate: row.content_date,
      phrase: row.phrase,
      subPhrase: row.sub_phrase,
      description: row.description,
      shortformVideoUrl: row.shortform_video_url || '',
      videoFile: null,
      posterFile: null,
      extraPublishDates: [],
    });
    setExtraDateInput('');
    setMessage(null);
    setDeleteConfirmId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetDraft = () => {
    setDraft(getInitialDraft(rows));
    setEditingId(null);
    setDeleteConfirmId(null);
    setExtraDateInput('');
  };

  const addExtraPublishDate = () => {
    const next = extraDateInput.trim();
    if (!next) return;
    if (next === draft.contentDate) {
      setMessage('원본 날짜와 같은 날짜는 추가할 수 없습니다.');
      return;
    }
    if (draft.extraPublishDates.includes(next)) {
      setMessage('이미 추가된 날짜입니다.');
      return;
    }
    setDraft((prev) => ({
      ...prev,
      extraPublishDates: [...prev.extraPublishDates, next].sort(),
    }));
    setExtraDateInput('');
    setMessage(null);
  };

  const removeExtraPublishDate = (date: string) => {
    setDraft((prev) => ({
      ...prev,
      extraPublishDates: prev.extraPublishDates.filter((d) => d !== date),
    }));
  };

  const uploadFile = async (file: File, folder: string, contentId: string) => {
    if (!supabase) return null;
    const extension = file.name.split('.').pop();
    const filePath = `${folder}/${draft.contentDate}/${contentId}-${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from(CONTENT_MEDIA_BUCKET).upload(filePath, file, {
      upsert: true,
      contentType: file.type,
    });
    if (error) {
      throw new Error(error.message);
    }
    return filePath;
  };

  const handleSave = async () => {
    if (!supabase || state.status !== 'ready') {
      return;
    }
    if (!draft.contentDate || !draft.phrase.trim()) {
      setMessage('날짜와 메인 문구(Phrase)는 필수입니다.');
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      let contentId = editingId;
      if (!contentId) {
        const existing = rows.find((r) => r.content_date === draft.contentDate);
        contentId = existing?.id || null;
      }

      const sourceRow = contentId ? rows.find((r) => r.id === contentId) : undefined;
      
      const payload: Partial<DailyContentRow> = {
        // 수정 중이면 원본 날짜 유지, 신규면 draft 날짜 사용
        content_date: editingId ? (sourceRow?.content_date || draft.contentDate) : draft.contentDate,
        phrase: draft.phrase.trim(),
        sub_phrase: draft.subPhrase.trim(),
        description: draft.description.trim(),
        social_caption: buildDefaultSocialCaption(draft.phrase, draft.subPhrase, draft.description),
        workflow_status: 'approved',
        app_publish_status: 'approved_live',
        is_published: true,
        published_at: new Date().toISOString(),
        publish_mode: 'immediate',
      };

      const idForUpload = contentId || `temp-${Date.now()}`;
      
      let newVideoPath: string | null = null;
      if (draft.videoFile) {
        newVideoPath = await uploadFile(draft.videoFile, 'manual-videos', idForUpload);
        payload.shortform_video_url = buildStoragePublicUrl(newVideoPath);
      } else if (draft.shortformVideoUrl) {
        payload.shortform_video_url = draft.shortformVideoUrl.trim();
      } else if (sourceRow?.shortform_video_url) {
        payload.shortform_video_url = sourceRow.shortform_video_url;
      } else {
        payload.shortform_video_url = null;
      }

      let newPosterPath: string | null = null;
      if (draft.posterFile) {
        newPosterPath = await uploadFile(draft.posterFile, 'manual-posters', idForUpload);
        payload.poster_asset_path = newPosterPath;
      } else if (sourceRow?.poster_asset_path) {
        payload.poster_asset_path = sourceRow.poster_asset_path;
      }

      // 원본에서 보상/배경 필드도 복제에 사용
      if (sourceRow) {
        payload.reward_url = sourceRow.reward_url;
        payload.reward_title = sourceRow.reward_title;
        payload.reward_artist = sourceRow.reward_artist;
        payload.reward_video_id = sourceRow.reward_video_id;
        payload.background_asset_path = sourceRow.background_asset_path;
        payload.app_playback_url = sourceRow.app_playback_url;
      }

      let savedData;
      
      if (contentId) {
        const { data, error: updateError } = await supabase
          .from('daily_contents')
          .update(payload)
          .eq('id', contentId)
          .select('id')
          .single();

        if (updateError) {
          throw new Error(updateError.message);
        }
        savedData = data;
      } else {
        payload.archetype = 'knight';
        payload.generator_provider = 'veo';
        
        const { data, error: insertError } = await supabase
          .from('daily_contents')
          .insert(payload)
          .select('id')
          .single();

        if (insertError) {
          throw new Error(insertError.message);
        }
        savedData = data;
      }

      // 추가 날짜에 같은 미션 복제 (예: 08-03 유지 + 08-07에도 게시)
      const extraDates = draft.extraPublishDates.filter(
        (d) => d && d !== payload.content_date
      );
      const copiedDates: string[] = [];
      const skippedDates: string[] = [];

      for (const extraDate of extraDates) {
        const existingExtra = rows.find((r) => r.content_date === extraDate);
        const copyPayload: Partial<DailyContentRow> = {
          ...payload,
          content_date: extraDate,
          archetype: sourceRow?.archetype || 'knight',
          generator_provider: sourceRow?.generator_provider || 'veo',
        };

        if (existingExtra) {
          const { error } = await supabase
            .from('daily_contents')
            .update(copyPayload)
            .eq('id', existingExtra.id);
          if (error) {
            skippedDates.push(`${extraDate}(${error.message})`);
            continue;
          }
          copiedDates.push(extraDate);
        } else {
          const { error } = await supabase
            .from('daily_contents')
            .insert(copyPayload);
          if (error) {
            skippedDates.push(`${extraDate}(${error.message})`);
            continue;
          }
          copiedDates.push(extraDate);
        }
      }

      let msg = contentId ? '콘텐츠가 수정되었습니다.' : '새 콘텐츠가 등록되었습니다.';
      if (copiedDates.length > 0) {
        msg += ` 추가 날짜에도 게시됨: ${copiedDates.join(', ')}`;
      }
      if (skippedDates.length > 0) {
        msg += ` / 실패: ${skippedDates.join(', ')}`;
      }
      setMessage(msg);
      resetDraft();
      await loadRows();
    } catch (error: any) {
      setMessage(error?.message || '저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!supabase || state.status !== 'ready') return;
    
    setBusy(true);
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      
      // 즉시 화면에서 제거 (Optimistic Update)
      setRows((prev) => prev.filter((r) => r.id !== id));
      
      const response = await fetch(`/api/content/${id}/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });
      
      const result = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        throw new Error(result.error || '삭제 중 오류가 발생했습니다.');
      }
      
      setMessage('삭제되었습니다.');
      setDeleteConfirmId(null);
      if (editingId === id) resetDraft();
      await loadRows();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '삭제에 실패했습니다.');
      setDeleteConfirmId(null);
      // 에러 발생 시 원상복구
      await loadRows();
    } finally {
      setBusy(false);
    }
  };

  // Pagination Logic
  const totalPages = Math.ceil(rows.length / ITEMS_PER_PAGE) || 1;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = rows.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <AdminShell
      title="수동 미션 관리"
      description="직접 제작한 영상과 문구로 자동 렌더링 과정을 생략하고 미션을 앱에 즉시 배포합니다."
      currentPath="/manual"
      sessionState={state}
      onLogout={signOut}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 400px) 1fr', gap: '2rem', alignItems: 'start' }}>
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">DIRECT UPLOAD</p>
              <h3 className="panel-title">{editingId ? '미션 수정' : '새 미션 등록'}</h3>
            </div>
          </div>
          
          <div className="panel-body">
            <div className="card-fields">
              <label className="field-block field-block-full">
                <span className="field-label">날짜 (CONTENT_DATE)</span>
                <input
                  type="date"
                  className="field-input"
                  value={draft.contentDate}
                  onChange={(e) => setDraft({ ...draft, contentDate: e.target.value })}
                  disabled={!!editingId}
                />
                {editingId ? (
                  <span className="upload-hint">원본 날짜는 유지됩니다. 아래에 추가 날짜를 넣으면 같은 미션이 그 날짜에도 게시됩니다.</span>
                ) : null}
              </label>

              <div className="field-block field-block-full">
                <span className="field-label">
                  추가 게시 날짜 {editingId ? '(원본 유지 + 다른 날짜에도 동일 미션)' : '(선택: 여러 날짜에 동시 게시)'}
                </span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="date"
                    className="field-input"
                    value={extraDateInput}
                    onChange={(e) => setExtraDateInput(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={addExtraPublishDate}
                    disabled={busy || !extraDateInput}
                  >
                    날짜 추가
                  </button>
                </div>
                {draft.extraPublishDates.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
                    {draft.extraPublishDates.map((date) => (
                      <button
                        key={date}
                        type="button"
                        className="ghost-button"
                        onClick={() => removeExtraPublishDate(date)}
                        title="클릭하면 제거"
                        style={{ fontSize: '0.8rem' }}
                      >
                        {date} ×
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="upload-hint">예: 08-03 미션을 편집한 뒤 08-07을 추가하면 두 날짜 모두에 같은 영상이 나갑니다.</span>
                )}
              </div>

              <label className="field-block field-block-full">
                <span className="field-label">메인 문구 (알람 해제 정답)</span>
                <input
                  type="text"
                  className="field-input"
                  value={draft.phrase}
                  onChange={(e) => setDraft({ ...draft, phrase: e.target.value })}
                  placeholder="예: 행증자명"
                />
              </label>

              <label className="field-block field-block-full">
                <span className="field-label">서브 문구</span>
                <input
                  type="text"
                  className="field-input"
                  value={draft.subPhrase}
                  onChange={(e) => setDraft({ ...draft, subPhrase: e.target.value })}
                  placeholder="예: 行證自明"
                />
              </label>

              <label className="field-block field-block-full">
                <span className="field-label">설명 (DESCRIPTION)</span>
                <textarea
                  className="field-textarea"
                  rows={3}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="미션에 대한 부연 설명"
                />
              </label>

              <label className="field-block field-block-full">
                <span className="field-label">외부 숏폼 영상 URL (직접 업로드 시 비워둠)</span>
                <input
                  type="text"
                  className="field-input"
                  value={draft.shortformVideoUrl}
                  onChange={(e) => setDraft({ ...draft, shortformVideoUrl: e.target.value })}
                  placeholder="https://..."
                />
              </label>

              <label className="field-block field-block-full">
                <span className="field-label">배경 동영상 직접 업로드 (MP4)</span>
                <input
                  type="file"
                  accept="video/mp4,video/quicktime"
                  className="field-input"
                  onChange={(e) => setDraft({ ...draft, videoFile: e.target.files?.[0] || null })}
                />
                {editingId && !draft.videoFile && <span className="upload-hint">선택하지 않으면 기존 영상이 유지됩니다.</span>}
              </label>

              <label className="field-block field-block-full">
                <span className="field-label">포스터 이미지 (JPG/PNG - 선택)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="field-input"
                  onChange={(e) => setDraft({ ...draft, posterFile: e.target.files?.[0] || null })}
                />
              </label>
            </div>

            {message && <div className="inline-banner">{message}</div>}

            <div className="card-actions card-actions-wrap" style={{ marginTop: '1.5rem' }}>
              <button
                type="button"
                className="primary-button"
                onClick={handleSave}
                disabled={busy}
              >
                {busy ? '저장 중...' : (editingId ? '수정·추가 날짜 즉시 배포' : '새 미션 즉시 배포')}
              </button>
              {editingId && (
                <button type="button" className="ghost-button" onClick={resetDraft} disabled={busy}>
                  취소
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">MISSION LIST</p>
              <h3 className="panel-title">등록된 미션 (최근 {rows.length}개)</h3>
            </div>
            <div className="metric-pill">PAGE {currentPage} / {totalPages}</div>
          </div>

          <div className="card-list" style={{ marginTop: '1rem' }}>
            {paginatedRows.map((row) => {
              const previewUrl = row.shortform_video_url || buildStoragePublicUrl(row.background_asset_path);
              const posterUrl = row.poster_asset_path ? buildStoragePublicUrl(row.poster_asset_path) : undefined;
              const isDeleting = deleteConfirmId === row.id;

              return (
                <article key={row.id} className="pipeline-card">
                  <div className="pipeline-card-top">
                    <div>
                      <p className="list-card-date">{row.content_date}</p>
                      <h4 className="list-card-title">{row.phrase}</h4>
                      {row.sub_phrase ? <p className="list-card-meta">{row.sub_phrase}</p> : null}
                    </div>
                    <div className="pipeline-status-stack">
                      <span className={`status-pill ${row.is_published ? 'status-pill-live' : ''}`}>
                        {WORKFLOW_STATUS_LABELS[row.workflow_status] || row.workflow_status}
                      </span>
                      <span className="status-pill">
                        {APP_PUBLISH_STATUS_LABELS[row.app_publish_status] || row.app_publish_status}
                      </span>
                    </div>
                  </div>

                  <p className="list-card-body">{row.description}</p>

                  <div className="media-preview-shell">
                    {previewUrl ? (
                      <video
                        className="media-preview-video"
                        src={previewUrl}
                        poster={posterUrl}
                        controls
                        playsInline
                      />
                    ) : (
                      <div className="media-preview-empty">업로드된 영상이 없습니다.</div>
                    )}
                  </div>

                  <div className="card-actions card-actions-wrap" style={{ marginTop: '1rem' }}>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => handleEdit(row)}
                      disabled={busy}
                    >
                      편집 (덮어쓰기)
                    </button>
                    
                    {isDeleting ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
                        <span style={{ fontSize: '0.875rem', color: 'var(--color-danger)' }}>정말 삭제하시겠습니까?</span>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => handleDelete(row.id)}
                          disabled={busy}
                        >
                          확인
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => setDeleteConfirmId(null)}
                          disabled={busy}
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="danger-button"
                        style={{ marginLeft: 'auto' }}
                        onClick={() => setDeleteConfirmId(row.id)}
                        disabled={busy}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
            
            {paginatedRows.length === 0 && (
              <div className="media-preview-empty">콘텐츠가 없습니다.</div>
            )}
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem', paddingBottom: '1rem' }}>
              <button
                type="button"
                className="ghost-button"
                disabled={currentPage === 1 || busy}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                이전 페이지
              </button>
              <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                className="ghost-button"
                disabled={currentPage === totalPages || busy}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                다음 페이지
              </button>
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
