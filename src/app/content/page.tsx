'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import {
  APP_PUBLISH_STATUS_LABELS,
  canApproveAndPublish,
  canApproveContent,
  canPublishNow,
  canRequestRender,
  canResolveDriveAsset,
  canRetryPlatform,
  canRetryRender,
  CONTENT_EVENT_LABELS,
  PLATFORM_PUBLISH_STATUS_LABELS,
  isPublishedLocked,
  logContentEvent,
} from '@/lib/contentOperations';
import {
  ARCHETYPE_OPTIONS,
  GENERATOR_PROVIDER_LABELS,
  getArchetypeLabel,
  monthKeyFromDate,
  normalizeDriveShareUrl,
  extractDriveFileId,
} from '@/lib/contentStudio';
import {
  buildDefaultSocialCaption,
  buildStoragePublicUrl,
  makeBackgroundUploadPath,
  WORKFLOW_STATUS_LABELS,
} from '@/lib/contentPipeline';
import { compareYmd, formatLocalYmd, tomorrowYmd } from '@/lib/dailyContentCalendar';
import { useAdminSession } from '@/lib/admin';
import { normalizeRewardUrl } from '@/lib/rewardUrl';
import {
  AppHealthResponse,
  ContentEventRow,
  ContentSeasonRow,
  DailyContentRow,
  GeneratorProvider,
  PublishJobRow,
  RenderJobRow,
  SocialHealthResponse,
  WorkflowStatus,
} from '@/lib/types';

type ContentDraft = {
  contentDate: string;
  seasonId: string;
  archetype: string;
  generatorProvider: GeneratorProvider;
  phrase: string;
  subPhrase: string;
  description: string;
  generationPromptDraft: string;
  generationPromptFinal: string;
  driveAsset: string;
  rewardUrl: string;
  socialCaption: string;
  publishMode: 'immediate' | 'scheduled';
  publishAt: string;
};

type SeasonDraft = {
  monthKey: string;
  title: string;
  themeFamily: string;
  seasonSummary: string;
  baseWorldPrompt: string;
  visualRules: string;
  isActive: boolean;
};

type PublishJobMap = Record<string, Partial<Record<'youtube' | 'instagram', PublishJobRow>>>;
type ContentEventMap = Map<string, ContentEventRow[]>;
type StatusFilter = 'all' | WorkflowStatus;
type DateFilter = 'all' | 'today' | 'tomorrow';

type GenerateUpcomingResponse = {
  createdCount: number;
  skippedCount: number;
  reusedCount?: number;
  createdDates: string[];
  skippedDates: string[];
  reusedDates?: string[];
  startDate: string;
  endDate: string;
  generationBackend: 'ollama' | 'deterministic';
  usedFallback: boolean;
  fallbackReason: string | null;
  generationModel: string | null;
  modelAttempts: Array<{
    model: string;
    success: boolean;
    fallbackReason: string | null;
  }>;
};

function getInitialDraft(): ContentDraft {
  return {
    contentDate: tomorrowYmd(),
    seasonId: '',
    archetype: 'knight',
    generatorProvider: 'veo',
    phrase: '',
    subPhrase: '',
    description: '',
    generationPromptDraft: '',
    generationPromptFinal: '',
    driveAsset: '',
    rewardUrl: '',
    socialCaption: '',
    publishMode: 'immediate',
    publishAt: '',
  };
}

function getInitialSeasonDraft(contentDate = tomorrowYmd()): SeasonDraft {
  return {
    monthKey: monthKeyFromDate(contentDate),
    title: `${monthKeyFromDate(contentDate)} 전장 시즌`,
    themeFamily: 'dark_fantasy_war',
    seasonSummary: '검은 전장과 금속성 질감, 절제된 분노와 승부욕이 흐르는 월간 시즌',
    baseWorldPrompt: 'Dark fantasy battlefield, brutal but restrained masculine energy, cinematic low-key light, black and muted gold palette.',
    visualRules: '9:16 vertical composition, full body hero silhouette, smoke, dust, rain, cold steel, torch glow, no embedded typography.',
    isActive: true,
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

function displayDriveAssetForEdit(row: DailyContentRow) {
  return row.drive_share_url || row.drive_file_id || '';
}

function toDateTimeLocalValue(iso: string | null) {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function toIsoOrNull(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function getLatestRenderJobMap(rows: RenderJobRow[]) {
  const map = new Map<string, RenderJobRow>();
  for (const row of rows) {
    if (!map.has(row.daily_content_id)) {
      map.set(row.daily_content_id, row);
    }
  }
  return map;
}

function getLatestPublishJobMap(rows: PublishJobRow[]): PublishJobMap {
  return rows.reduce<PublishJobMap>((accumulator, row) => {
    if (!accumulator[row.daily_content_id]) {
      accumulator[row.daily_content_id] = {};
    }
    if (!accumulator[row.daily_content_id]?.[row.platform]) {
      accumulator[row.daily_content_id][row.platform] = row;
    }
    return accumulator;
  }, {});
}

function getRecentEventMap(rows: ContentEventRow[]) {
  const map: ContentEventMap = new Map();
  for (const row of rows) {
    const current = map.get(row.daily_content_id) ?? [];
    if (current.length < 5) {
      current.push(row);
      map.set(row.daily_content_id, current);
    }
  }
  return map;
}

function formatEventTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getLockedFieldChanges(row: DailyContentRow, draft: ContentDraft, publishAt: string | null) {
  const changes: string[] = [];
  const normalizedDriveShareUrl = normalizeDriveShareUrl(draft.driveAsset);
  const normalizedDriveFileId = extractDriveFileId(draft.driveAsset);

  if (row.content_date !== draft.contentDate) {
    changes.push('DATE');
  }
  if ((row.season_id ?? '') !== draft.seasonId) {
    changes.push('SEASON');
  }
  if ((row.archetype ?? '') !== draft.archetype) {
    changes.push('ARCHETYPE');
  }
  if ((row.generator_provider ?? '') !== draft.generatorProvider) {
    changes.push('PROVIDER');
  }
  if (row.phrase !== draft.phrase.trim()) {
    changes.push('PHRASE');
  }
  if (row.sub_phrase !== draft.subPhrase.trim()) {
    changes.push('SUB PHRASE');
  }
  if ((row.generation_prompt_draft ?? '') !== draft.generationPromptDraft.trim()) {
    changes.push('PROMPT DRAFT');
  }
  if ((row.generation_prompt_final ?? '') !== draft.generationPromptFinal.trim()) {
    changes.push('PROMPT FINAL');
  }
  if ((row.drive_share_url ?? null) !== normalizedDriveShareUrl) {
    changes.push('DRIVE URL');
  }
  if ((row.drive_file_id ?? null) !== normalizedDriveFileId) {
    changes.push('DRIVE FILE');
  }
  if (row.publish_mode !== draft.publishMode) {
    changes.push('PUBLISH MODE');
  }
  if ((row.publish_at ?? null) !== publishAt) {
    changes.push('PUBLISH AT');
  }

  return changes;
}

function getChangedDetailFields(row: DailyContentRow, draft: ContentDraft, normalizedRewardUrl: string | null) {
  const changes: string[] = [];

  if (row.description !== draft.description.trim()) {
    changes.push('description');
  }
  if (row.social_caption !== (draft.socialCaption.trim() || buildDefaultSocialCaption(draft.phrase, draft.subPhrase, draft.description))) {
    changes.push('social_caption');
  }
  if ((row.reward_url ?? null) !== normalizedRewardUrl) {
    changes.push('reward_url');
  }

  return changes;
}

const ITEMS_PER_PAGE = 3;

export default function ContentPage() {
  const { supabase, state, signOut } = useAdminSession();
  const actorEmail = state.status === 'ready' ? state.email : 'unknown@local';
  const [rows, setRows] = useState<DailyContentRow[]>([]);
  const [seasons, setSeasons] = useState<ContentSeasonRow[]>([]);
  const [latestRenderJobs, setLatestRenderJobs] = useState<Map<string, RenderJobRow>>(new Map());
  const [latestPublishJobs, setLatestPublishJobs] = useState<PublishJobMap>({});
  const [recentEvents, setRecentEvents] = useState<ContentEventMap>(new Map());
  const [draft, setDraft] = useState<ContentDraft>(getInitialDraft);
  const [seasonDraft, setSeasonDraft] = useState<SeasonDraft>(() => getInitialSeasonDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [appHealth, setAppHealth] = useState<AppHealthResponse | null>(null);
  const [socialHealth, setSocialHealth] = useState<SocialHealthResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [seasonBusy, setSeasonBusy] = useState(false);
  const [rowBusyKey, setRowBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [failedOnly, setFailedOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, dateFilter, failedOnly]);

  const todayYmd = formatLocalYmd(new Date());
  const minSelectableYmd = tomorrowYmd();
  const editingRow = useMemo(
    () => rows.find((row) => row.id === editingId) ?? null,
    [editingId, rows],
  );
  const seasonsById = useMemo(
    () => new Map(seasons.map((season) => [season.id, season])),
    [seasons],
  );
  const editingPublished = editingRow ? isPublishedLocked(editingRow) : false;
  const isLegacyContentDate = Boolean(
    editingId && draft.contentDate && compareYmd(draft.contentDate, minSelectableYmd) < 0,
  );

  const getAccessToken = useCallback(async () => {
    if (!supabase) {
      return null;
    }
    const session = await supabase.auth.getSession();
    return session.data.session?.access_token ?? null;
  }, [supabase]);

  const callAdminApi = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('관리자 세션이 만료되었습니다. 다시 로그인해 주세요.');
      }

      const response = await fetch(path, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          ...(init?.headers ?? {}),
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : '요청 처리에 실패했습니다.');
      }

      return payload as T;
    },
    [getAccessToken],
  );

  const loadRows = useCallback(async () => {
    if (!supabase || state.status !== 'ready') {
      return;
    }

    const [contentResult, seasonResult, renderJobResult, publishJobResult, contentEventResult] = await Promise.all([
      supabase.from('daily_contents').select('*').order('content_date', { ascending: false }).limit(80),
      supabase.from('content_seasons').select('*').order('month_key', { ascending: false }).limit(24),
      supabase.from('render_jobs').select('*').order('created_at', { ascending: false }).limit(160),
      supabase.from('publish_jobs').select('*').order('created_at', { ascending: false }).limit(320),
      supabase.from('content_events').select('*').order('created_at', { ascending: false }).limit(480),
    ]);

    if (contentResult.error || seasonResult.error || renderJobResult.error || publishJobResult.error || contentEventResult.error) {
      setMessage(
        contentResult.error?.message
          || seasonResult.error?.message
          || renderJobResult.error?.message
          || publishJobResult.error?.message
          || contentEventResult.error?.message
          || '운영 데이터를 불러오지 못했습니다.',
      );
      return;
    }

    setRows(contentResult.data ?? []);
    setSeasons((seasonResult.data ?? []) as ContentSeasonRow[]);
    setLatestRenderJobs(getLatestRenderJobMap(renderJobResult.data ?? []));
    setLatestPublishJobs(getLatestPublishJobMap(publishJobResult.data ?? []));
    setRecentEvents(getRecentEventMap((contentEventResult.data ?? []) as ContentEventRow[]));
  }, [state.status, supabase]);

  const loadHealth = useCallback(async () => {
    if (state.status !== 'ready') {
      return;
    }

    try {
      const [app, social] = await Promise.all([
        callAdminApi<AppHealthResponse>('/api/health', { method: 'GET' }),
        callAdminApi<{ health: SocialHealthResponse }>('/api/social/health', { method: 'GET' }),
      ]);
      setAppHealth(app);
      setSocialHealth(social.health);
    } catch {
      setAppHealth(null);
      setSocialHealth(null);
    }
  }, [callAdminApi, state.status]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadRows().catch(() => undefined);
      loadHealth().catch(() => undefined);
    }, 0);

    return () => clearTimeout(timer);
  }, [loadHealth, loadRows]);

  useEffect(() => {
    if (!draft.seasonId && seasons.length > 0) {
      const activeSeason = seasons.find((season) => season.is_active) ?? seasons[0];
      setDraft((current) => ({ ...current, seasonId: activeSeason?.id ?? '' }));
    }
  }, [draft.seasonId, seasons]);

  useEffect(() => {
    setSeasonDraft((current) => ({
      ...current,
      monthKey: monthKeyFromDate(draft.contentDate),
    }));
  }, [draft.contentDate]);

  const resetDraft = () => {
    setDraft((current) => {
      const next = getInitialDraft();
      if (seasons.length > 0) {
        const activeSeason = seasons.find((season) => season.is_active) ?? seasons[0];
        next.seasonId = activeSeason?.id ?? '';
      }
      return { ...next, contentDate: current.contentDate || next.contentDate };
    });
    setSeasonDraft(getInitialSeasonDraft());
    setEditingId(null);
  };

  const handleEdit = (row: DailyContentRow) => {
    setEditingId(row.id);
    setDraft({
      contentDate: row.content_date,
      seasonId: row.season_id ?? '',
      archetype: row.archetype ?? 'knight',
      generatorProvider: row.generator_provider ?? 'veo',
      phrase: row.phrase,
      subPhrase: row.sub_phrase,
      description: row.description,
      generationPromptDraft: row.generation_prompt_draft ?? '',
      generationPromptFinal: row.generation_prompt_final ?? '',
      driveAsset: displayDriveAssetForEdit(row),
      rewardUrl: displayRewardUrlForEdit(row),
      socialCaption: row.social_caption || buildDefaultSocialCaption(row.phrase, row.sub_phrase, row.description),
      publishMode: row.publish_mode,
      publishAt: toDateTimeLocalValue(row.publish_at),
    });
    setSeasonDraft(getInitialSeasonDraft(row.content_date));
    setMessage(null);
  };

  const handleSave = async () => {
    if (!supabase || state.status !== 'ready') {
      return;
    }

    if (!draft.contentDate || !draft.seasonId || !draft.phrase.trim() || !draft.description.trim()) {
      setMessage('날짜, 시즌, 문구, 설명은 반드시 채워야 합니다.');
      return;
    }

    if (!draft.generatorProvider || !draft.archetype) {
      setMessage('생성 툴(provider)과 아키타입을 먼저 선택해야 합니다.');
      return;
    }

    if (!editingPublished && !isLegacyContentDate && compareYmd(draft.contentDate, minSelectableYmd) < 0) {
      setMessage(`날짜는 내일(${minSelectableYmd}) 이후만 선택할 수 있습니다.`);
      return;
    }

    const normalizedReward = normalizeRewardUrl(draft.rewardUrl);
    if (draft.rewardUrl.trim() && !normalizedReward) {
      setMessage('보상 링크는 http:// 또는 https:// 로 시작하는 URL이어야 합니다.');
      return;
    }

    const publishAt = draft.publishMode === 'scheduled' ? toIsoOrNull(draft.publishAt) : null;
    if (!editingPublished && draft.publishMode === 'scheduled' && !publishAt) {
      setMessage('예약 게시를 쓰려면 게시 시각을 먼저 정해야 합니다.');
      return;
    }

    const socialCaption =
      draft.socialCaption.trim()
      || buildDefaultSocialCaption(draft.phrase, draft.subPhrase, draft.description);
    const normalizedDriveShareUrl = normalizeDriveShareUrl(draft.driveAsset);
    const normalizedDriveFileId = extractDriveFileId(draft.driveAsset);

    const originalRow = editingRow;
    if (originalRow && editingPublished) {
      const lockedChanges = getLockedFieldChanges(originalRow, draft, publishAt);
      if (lockedChanges.length > 0) {
        setMessage(`게시 후에는 ${lockedChanges.join(', ')} 필드를 수정할 수 없습니다.`);
        return;
      }

      const allowedChanges = getChangedDetailFields(originalRow, draft, normalizedReward);
      if (allowedChanges.length === 0) {
        setMessage('변경된 허용 필드가 없습니다.');
        return;
      }

      setBusy(true);
      setMessage(null);

      const updateResult = await supabase
        .from('daily_contents')
        .update({
          description: draft.description.trim(),
          social_caption: socialCaption,
          reward_url: normalizedReward,
        })
        .eq('id', originalRow.id)
        .select('id')
        .single();

      setBusy(false);

      if (updateResult.error) {
        setMessage(updateResult.error.message);
        return;
      }

      try {
        await logContentEvent(supabase, {
          dailyContentId: originalRow.id,
          eventType: 'content_updated',
          actorEmail,
          detail: {
            publishedEdit: true,
            changedFields: allowedChanges,
          },
        });
      } catch (eventError) {
        console.error('[content page] content_events insert failed', eventError);
      }

      resetDraft();
      setMessage('게시된 콘텐츠의 허용 필드만 갱신했습니다.');
      await loadRows();
      return;
    }

    setBusy(true);
    setMessage(null);

    const payload = {
      content_date: draft.contentDate,
      season_id: draft.seasonId,
      archetype: draft.archetype,
      generator_provider: draft.generatorProvider,
      phrase: draft.phrase.trim(),
      sub_phrase: draft.subPhrase.trim(),
      description: draft.description.trim(),
      generation_prompt_draft: draft.generationPromptDraft.trim() || null,
      generation_prompt_final: draft.generationPromptFinal.trim() || null,
      drive_file_id: normalizedDriveFileId,
      drive_share_url: normalizedDriveShareUrl,
      app_playback_url: null,
      app_publish_status: 'draft',
      reward_url: normalizedReward,
      reward_title: null,
      reward_artist: null,
      reward_video_id: null,
      social_caption: socialCaption,
      publish_mode: draft.publishMode,
      publish_at: publishAt,
      workflow_status: 'draft',
      is_published: false,
      youtube_publish_status: 'pending',
      instagram_publish_status: 'pending',
      youtube_last_error: null,
      instagram_last_error: null,
      shortform_video_url: null,
      poster_asset_path: null,
      active_publish_request_id: null,
      approved_at: null,
      published_at: null,
      youtube_video_id: null,
      youtube_url: null,
      instagram_media_id: null,
      instagram_url: null,
      last_error: null,
    };

    const result = editingId
      ? await supabase.from('daily_contents').update(payload).eq('id', editingId).select('id').single()
      : await supabase.from('daily_contents').insert(payload).select('id').single();

    setBusy(false);

    if (result.error || !result.data?.id) {
      setMessage(result.error?.message || '콘텐츠 저장에 실패했습니다.');
      return;
    }

    try {
      await logContentEvent(supabase, {
        dailyContentId: result.data.id,
        eventType: editingId ? 'content_updated' : 'content_created',
        actorEmail,
        detail: {
          phrase: draft.phrase.trim(),
          seasonId: draft.seasonId,
          archetype: draft.archetype,
          provider: draft.generatorProvider,
          driveConfigured: Boolean(normalizedDriveFileId),
          publishMode: 'scheduled',
          publishAt,
        },
      });
    } catch (eventError) {
      console.error('[content page] content_events insert failed', eventError);
    }

    resetDraft();
    setMessage(editingId ? '콘텐츠를 갱신했고 Drive/앱 공개 상태를 초안으로 되돌렸습니다.' : '새 콘텐츠 파이프라인 항목을 만들었습니다.');
    await loadRows();
  };

  const handleDelete = async (row: DailyContentRow) => {
    if (!supabase || state.status !== 'ready') {
      return;
    }

    if (isPublishedLocked(row)) {
      setMessage('게시된 콘텐츠는 삭제할 수 없습니다.');
      return;
    }

    if (['rendering', 'publishing'].includes(row.workflow_status)) {
      setMessage('진행 중인 렌더/게시가 끝난 뒤에 삭제해야 합니다.');
      return;
    }

    setBusy(true);
    
    // 즉시 화면에서 제거 (Optimistic Update)
    setRows((prev) => prev.filter((r) => r.id !== row.id));

    const { error } = await supabase.from('daily_contents').delete().eq('id', row.id);
    setBusy(false);

    if (error) {
      setMessage(error.message);
      // 에러 발생 시 원상복구
      await loadRows();
      return;
    }

    if (editingId === row.id) {
      resetDraft();
    }

    setMessage('콘텐츠를 삭제했습니다.');
    await loadRows();
  };

  const handleSaveSeason = async () => {
    if (!supabase || state.status !== 'ready') {
      return;
    }

    if (!seasonDraft.monthKey || !seasonDraft.title.trim() || !seasonDraft.themeFamily.trim()) {
      setMessage('시즌 month, title, theme family는 반드시 입력해야 합니다.');
      return;
    }

    setSeasonBusy(true);
    setMessage(null);

    if (seasonDraft.isActive) {
      const deactivateResult = await supabase
        .from('content_seasons')
        .update({ is_active: false })
        .eq('is_active', true);

      if (deactivateResult.error) {
        setSeasonBusy(false);
        setMessage(deactivateResult.error.message);
        return;
      }
    }

    const seasonResult = await supabase
      .from('content_seasons')
      .upsert({
        month_key: seasonDraft.monthKey,
        title: seasonDraft.title.trim(),
        theme_family: seasonDraft.themeFamily.trim(),
        season_summary: seasonDraft.seasonSummary.trim(),
        base_world_prompt: seasonDraft.baseWorldPrompt.trim(),
        visual_rules: seasonDraft.visualRules.trim(),
        is_active: seasonDraft.isActive,
      }, { onConflict: 'month_key' })
      .select('*')
      .single();

    setSeasonBusy(false);

    if (seasonResult.error || !seasonResult.data) {
      setMessage(seasonResult.error?.message || '시즌 저장에 실패했습니다.');
      return;
    }

    setDraft((current) => ({ ...current, seasonId: (seasonResult.data as ContentSeasonRow).id }));
    setMessage('월 시즌을 저장했습니다.');
    await loadRows();
  };

  const handleGeneratePrompt = async () => {
    if (!editingId) {
      setMessage('먼저 콘텐츠를 한 번 저장한 뒤 프롬프트를 생성해야 합니다.');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const response = await callAdminApi<{ promptDraft: string }>('/api/content/' + editingId + '/generate-prompt', {
        method: 'POST',
      });
      setDraft((current) => {
        const nextFinal = current.generationPromptFinal.trim() || response.promptDraft;
        return {
          ...current,
          generationPromptDraft: response.promptDraft,
          generationPromptFinal: nextFinal,
        };
      });
      setMessage('프롬프트 초안을 생성했습니다. final prompt는 필요하면 수정하세요.');
      await loadRows();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '프롬프트 생성에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleResolveDrive = async () => {
    if (!editingId) {
      setMessage('먼저 콘텐츠를 저장한 뒤 Drive 해석을 실행해야 합니다.');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const response = await callAdminApi<{ appPlaybackUrl: string }>(`/api/content/${editingId}/resolve-drive-asset`, {
        method: 'POST',
      });
      setMessage(`Drive 원본을 앱 재생 URL로 해석했습니다. ${response.appPlaybackUrl}`);
      await loadRows();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Drive 에셋 해석에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateUpcoming = async (days: number) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await callAdminApi<GenerateUpcomingResponse>('/api/content/generate-upcoming', {
        method: 'POST',
        body: JSON.stringify({
          days,
          startDate: draft.contentDate || minSelectableYmd,
          seasonId: draft.seasonId || null,
          generatorProvider: draft.generatorProvider,
          archetype: draft.archetype,
          publishMode: 'scheduled',
        }),
      });

      const summary = response.createdCount > 0
        ? `자동 초안 ${response.createdCount}건을 만들었습니다.`
        : '새로 만든 초안은 없습니다.';
      const skipSummary = response.skippedCount > 0
        ? ` 기존 일정 ${response.skippedCount}건은 건너뛰었습니다.`
        : '';
      const reuseSummary = response.reusedCount && response.reusedCount > 0
        ? ` 전년도 같은 날짜 콘텐츠 ${response.reusedCount}건을 재사용했습니다.`
        : '';
      const backendSummary = response.generationBackend === 'ollama'
        ? ` Ollama 생성기를 사용했습니다${response.generationModel ? ` (${response.generationModel})` : ''}.`
        : ' 규칙 기반 생성기를 사용했습니다.';
      const fallbackSummary = response.usedFallback && response.fallbackReason
        ? ` Ollama 실패로 fallback 적용: ${response.fallbackReason}`
        : '';
      setMessage(`${summary}${skipSummary}${reuseSummary}${backendSummary}${fallbackSummary} (${response.startDate} ~ ${response.endDate})`);
      await loadRows();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '자동 초안 생성에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleUploadBackground = async (row: DailyContentRow, file: File | null) => {
    if (!supabase || !file) {
      return;
    }

    if (isPublishedLocked(row)) {
      setMessage('게시된 콘텐츠는 배경 영상을 바꿀 수 없습니다. 새 초안을 만들어 주세요.');
      return;
    }

    const path = makeBackgroundUploadPath({
      contentDate: row.content_date,
      contentId: row.id,
      fileName: file.name,
      mimeType: file.type || 'video/mp4',
    });

    setRowBusyKey(`upload-${row.id}`);
    setMessage(null);

    const uploadResult = await supabase.storage.from('content-media').upload(path, file, {
      upsert: true,
      contentType: file.type || 'video/mp4',
    });

    if (uploadResult.error) {
      setRowBusyKey(null);
      setMessage(uploadResult.error.message);
      return;
    }

    const assetUpsert = await supabase.from('media_assets').upsert({
      daily_content_id: row.id,
      storage_path: path,
      mime_type: file.type || 'video/mp4',
      duration_ms: null,
      width: null,
      height: null,
    });

    if (assetUpsert.error) {
      setRowBusyKey(null);
      setMessage(assetUpsert.error.message);
      return;
    }

    const contentUpdate = await supabase
      .from('daily_contents')
      .update({
        background_asset_path: path,
        app_playback_url: null,
        app_publish_status: 'draft',
        youtube_publish_status: 'pending',
        instagram_publish_status: 'pending',
        youtube_last_error: null,
        instagram_last_error: null,
        shortform_video_url: null,
        poster_asset_path: null,
        workflow_status: 'draft',
        is_published: false,
        active_publish_request_id: null,
        approved_at: null,
        published_at: null,
        youtube_video_id: null,
        youtube_url: null,
        instagram_media_id: null,
        instagram_url: null,
        last_error: null,
      })
      .eq('id', row.id);

    setRowBusyKey(null);

    if (contentUpdate.error) {
      setMessage(contentUpdate.error.message);
      return;
    }

    try {
      await logContentEvent(supabase, {
        dailyContentId: row.id,
        eventType: 'background_uploaded',
        actorEmail,
        detail: {
          storagePath: path,
          mimeType: file.type || 'video/mp4',
        },
      });
    } catch (eventError) {
      console.error('[content page] content_events insert failed', eventError);
    }

    setMessage(`${row.phrase} 항목의 배경 영상을 업로드했습니다. 이제 Render preview를 실행하세요.`);
    await loadRows();
  };

  const runRowAction = async (
    row: DailyContentRow,
    key: string,
    path: string,
    successMessage: string,
  ) => {
    setRowBusyKey(`${key}-${row.id}`);
    setMessage(null);

    try {
      await callAdminApi(path, { method: 'POST' });
      setMessage(successMessage);
      await loadRows();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '요청 처리에 실패했습니다.');
    } finally {
      setRowBusyKey(null);
    }
  };

  const getApproveActionConfig = (row: Pick<DailyContentRow, 'id' | 'publish_mode'>) => {
    if (row.publish_mode === 'scheduled') {
      return {
        key: 'approve',
        path: `/api/content/${row.id}/approve`,
        label: '승인 + 예약',
        successMessage: '승인했고 예약 대기 상태로 넘겼습니다.',
      };
    }

    return {
      key: 'approve-publish',
      path: `/api/content/${row.id}/approve-and-publish`,
      label: '승인 + 즉시 공개',
      successMessage: '승인했고 앱 공개를 시작했습니다.',
    };
  };

  const runApproveAction = async (row: DailyContentRow) => {
    const action = getApproveActionConfig(row);
    await runRowAction(row, action.key, action.path, action.successMessage);
  };

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.workflow_status !== statusFilter) {
        return false;
      }
      if (failedOnly && row.workflow_status !== 'failed') {
        return false;
      }
      if (dateFilter === 'today' && row.content_date !== todayYmd) {
        return false;
      }
      if (dateFilter === 'tomorrow' && row.content_date !== tomorrowYmd()) {
        return false;
      }
      return true;
    });
  }, [dateFilter, failedOnly, rows, statusFilter, todayYmd]);

  const totalPages = Math.ceil(filteredRows.length / ITEMS_PER_PAGE) || 1;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = filteredRows.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const rowCountLabel = useMemo(() => `PAGE ${currentPage}/${totalPages} (${filteredRows.length}/${rows.length}건)`, [currentPage, totalPages, filteredRows.length, rows.length]);

  return (
    <AdminShell
      title="콘텐츠 파이프라인"
      description="상태 전이, 예약 게시, 실패 재시도, 최근 이벤트를 한 화면에서 추적하는 운영 콘솔입니다."
      currentPath="/content"
      sessionState={state}
      onLogout={() => signOut().catch(() => undefined)}
    >
      <div className="page-grid">
        <section className="panel panel-form">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">PIPELINE INPUT</p>
              <h3 className="panel-title">{editingId ? '콘텐츠 수정' : '콘텐츠 등록'}</h3>
            </div>
            <button type="button" className="ghost-button" onClick={resetDraft}>
              초기화
            </button>
          </div>

          <div className="health-grid">
            <div className={`health-chip ${appHealth?.ok ? 'health-chip-ok' : ''}`}>API {appHealth?.ok ? 'READY' : 'DOWN'}</div>
            <div className={`health-chip ${appHealth?.databaseReachable ? 'health-chip-ok' : ''}`}>DB {appHealth?.databaseReachable ? 'READY' : 'PENDING'}</div>
            <div className={`health-chip ${socialHealth?.workerConfigured ? 'health-chip-ok' : ''}`}>WORKER {socialHealth?.workerConfigured ? 'READY' : 'PENDING'}</div>
            <div className={`health-chip ${socialHealth?.contentGeneratorConfigured ? 'health-chip-ok' : ''}`}>GENERATOR {socialHealth ? `${socialHealth.contentGeneratorBackend.toUpperCase()} ${socialHealth.contentGeneratorConfigured ? 'READY' : 'MISSING'}` : 'PENDING'}</div>
            <div className={`health-chip ${socialHealth?.youtubeConfigured ? 'health-chip-ok' : ''}`}>YOUTUBE {socialHealth?.youtubeConfigured ? 'READY' : 'MISSING'}</div>
            <div className={`health-chip ${socialHealth?.instagramConfigured ? 'health-chip-ok' : ''}`}>INSTAGRAM {socialHealth?.instagramConfigured ? 'READY' : 'MISSING'}</div>
          </div>

          {editingPublished ? (
            <div className="inline-banner inline-banner-warning">
              게시된 콘텐츠는 `description`, `social_caption`, `reward_url`만 수정할 수 있습니다.
            </div>
          ) : null}

          <div className="inline-banner">
            월 시즌을 먼저 만들고, 필요하면 `7일/30일 자동 초안`을 생성합니다. 이후 `프롬프트 점검`, `Drive 또는 배경 영상 연결`, `승인`만 하면 즉시 공개 또는 예약 대기까지 이어집니다.
          </div>

          <div className="field-grid">
            <label className="field-block">
              <span className="field-label">SEASON MONTH</span>
              <input
                className="field-input"
                type="month"
                value={seasonDraft.monthKey}
                onChange={(event) => setSeasonDraft((current) => ({ ...current, monthKey: event.target.value }))}
              />
            </label>
            <label className="field-block">
              <span className="field-label">SEASON TITLE</span>
              <input
                className="field-input"
                value={seasonDraft.title}
                onChange={(event) => setSeasonDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="2026-04 전장 시즌"
              />
            </label>
            <label className="field-block">
              <span className="field-label">THEME FAMILY</span>
              <input
                className="field-input"
                value={seasonDraft.themeFamily}
                onChange={(event) => setSeasonDraft((current) => ({ ...current, themeFamily: event.target.value }))}
                placeholder="dark_fantasy_war"
              />
            </label>
            <label className="field-block">
              <span className="field-label">ACTIVE</span>
              <select
                className="field-input"
                value={seasonDraft.isActive ? 'active' : 'inactive'}
                onChange={(event) => setSeasonDraft((current) => ({ ...current, isActive: event.target.value === 'active' }))}
              >
                <option value="active">활성 시즌</option>
                <option value="inactive">비활성 시즌</option>
              </select>
            </label>
            <label className="field-block field-block-full">
              <span className="field-label">SEASON SUMMARY</span>
              <textarea
                className="field-textarea"
                rows={2}
                value={seasonDraft.seasonSummary}
                onChange={(event) => setSeasonDraft((current) => ({ ...current, seasonSummary: event.target.value }))}
              />
            </label>
            <label className="field-block field-block-full">
              <span className="field-label">BASE WORLD PROMPT</span>
              <textarea
                className="field-textarea"
                rows={3}
                value={seasonDraft.baseWorldPrompt}
                onChange={(event) => setSeasonDraft((current) => ({ ...current, baseWorldPrompt: event.target.value }))}
              />
            </label>
            <label className="field-block field-block-full">
              <span className="field-label">VISUAL RULES</span>
              <textarea
                className="field-textarea"
                rows={3}
                value={seasonDraft.visualRules}
                onChange={(event) => setSeasonDraft((current) => ({ ...current, visualRules: event.target.value }))}
              />
            </label>
          </div>

          <button type="button" className="ghost-button" onClick={() => handleSaveSeason().catch(() => undefined)} disabled={seasonBusy}>
            {seasonBusy ? '시즌 저장 중...' : '월 시즌 저장'}
          </button>

          <div className="field-grid" style={{ marginTop: 18 }}>
            <label className="field-block">
              <span className="field-label">DATE</span>
              {isLegacyContentDate || editingPublished ? (
                <p className="sql-panel-hint">{draft.contentDate} {editingPublished ? '(게시 후 잠금)' : '(과거 일정은 날짜 고정)'}</p>
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
              <span className="field-label">SEASON</span>
              <select
                className="field-input"
                value={draft.seasonId}
                disabled={editingPublished}
                onChange={(event) => setDraft((current) => ({ ...current, seasonId: event.target.value }))}
              >
                <option value="">시즌 선택</option>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.month_key} · {season.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-block">
              <span className="field-label">PROVIDER</span>
              <select
                className="field-input"
                value={draft.generatorProvider}
                disabled={editingPublished}
                onChange={(event) => setDraft((current) => ({ ...current, generatorProvider: event.target.value as GeneratorProvider }))}
              >
                {Object.entries(GENERATOR_PROVIDER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label className="field-block">
              <span className="field-label">ARCHETYPE</span>
              <select
                className="field-input"
                value={draft.archetype}
                disabled={editingPublished}
                onChange={(event) => setDraft((current) => ({ ...current, archetype: event.target.value }))}
              >
                {ARCHETYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="field-block">
              <span className="field-label">PHRASE</span>
              <input
                className="field-input"
                value={draft.phrase}
                disabled={editingPublished}
                onChange={(event) => setDraft((current) => ({ ...current, phrase: event.target.value }))}
                placeholder="예: 행증자명"
              />
            </label>

            <label className="field-block">
              <span className="field-label">SUB PHRASE</span>
              <input
                className="field-input"
                value={draft.subPhrase}
                disabled={editingPublished}
                onChange={(event) => setDraft((current) => ({ ...current, subPhrase: event.target.value }))}
                placeholder="예: 行證自明"
              />
            </label>

            <label className="field-block field-block-full">
              <span className="field-label">DESCRIPTION</span>
              <textarea
                className="field-textarea"
                rows={4}
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder="행동을 증명해라..."
              />
            </label>

            <label className="field-block field-block-full">
              <span className="field-label">PROMPT DRAFT</span>
              <textarea
                className="field-textarea"
                rows={5}
                value={draft.generationPromptDraft}
                disabled
                placeholder="저장 후 '프롬프트 초안 생성'을 누르면 자동 채움"
              />
            </label>

            <label className="field-block field-block-full">
              <span className="field-label">PROMPT FINAL (EDIT)</span>
              <textarea
                className="field-textarea"
                rows={6}
                value={draft.generationPromptFinal}
                disabled={editingPublished}
                onChange={(event) => setDraft((current) => ({ ...current, generationPromptFinal: event.target.value }))}
                placeholder="외부 생성 툴에 넣을 최종 프롬프트"
              />
            </label>

            <label className="field-block field-block-full">
              <span className="field-label">GOOGLE DRIVE FILE ID / SHARE URL</span>
              <input
                className="field-input"
                value={draft.driveAsset}
                disabled={editingPublished}
                onChange={(event) => setDraft((current) => ({ ...current, driveAsset: event.target.value }))}
                placeholder="Drive 파일 ID 또는 공유 URL"
              />
            </label>

            <label className="field-block field-block-full">
              <span className="field-label">REWARD URL</span>
              <input
                className="field-input"
                value={draft.rewardUrl}
                onChange={(event) => setDraft((current) => ({ ...current, rewardUrl: event.target.value }))}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </label>

            <label className="field-block field-block-full">
              <span className="field-label">SOCIAL CAPTION</span>
              <textarea
                className="field-textarea"
                rows={4}
                value={draft.socialCaption}
                onChange={(event) => setDraft((current) => ({ ...current, socialCaption: event.target.value }))}
                placeholder="인스타/유튜브 설명 문구"
              />
            </label>
          </div>

          {message ? <div className="inline-banner">{message}</div> : null}

          <div className="card-actions card-actions-wrap">
            <button type="button" className="primary-button" onClick={handleSave} disabled={busy}>
              {busy ? '저장 중...' : editingId ? '콘텐츠 갱신' : '콘텐츠 생성'}
            </button>
            <button type="button" className="ghost-button" onClick={() => handleGenerateUpcoming(7).catch(() => undefined)} disabled={busy}>
              7일 초안 생성
            </button>
            <button type="button" className="ghost-button" onClick={() => handleGenerateUpcoming(30).catch(() => undefined)} disabled={busy}>
              30일 초안 생성
            </button>
            <button type="button" className="ghost-button" onClick={() => handleGeneratePrompt().catch(() => undefined)} disabled={busy || !editingId || editingPublished}>
              프롬프트 초안 생성
            </button>
            <button type="button" className="ghost-button" onClick={() => handleResolveDrive().catch(() => undefined)} disabled={busy || !editingId || editingPublished}>
              Drive 재생 링크 해석
            </button>
            <button
              type="button"
              className="primary-button primary-button-small"
              onClick={() => editingRow && runApproveAction(editingRow).catch(() => undefined)}
              disabled={!editingRow || !((editingRow.publish_mode === 'scheduled' && canApproveContent(editingRow)) || (editingRow.publish_mode !== 'scheduled' && canApproveAndPublish(editingRow))) || busy}
            >
              {editingRow ? getApproveActionConfig(editingRow).label : '승인 실행'}
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">OPS CONSOLE</p>
              <h3 className="panel-title">등록된 콘텐츠</h3>
            </div>
            <div className="metric-pill">{rowCountLabel}</div>
          </div>

          <div className="filter-bar">
            <div className="filter-row">
              <button
                type="button"
                className={`filter-chip ${dateFilter === 'all' ? 'filter-chip-active' : ''}`}
                onClick={() => setDateFilter('all')}
              >
                전체
              </button>
              <button
                type="button"
                className={`filter-chip ${dateFilter === 'today' ? 'filter-chip-active' : ''}`}
                onClick={() => setDateFilter('today')}
              >
                오늘
              </button>
              <button
                type="button"
                className={`filter-chip ${dateFilter === 'tomorrow' ? 'filter-chip-active' : ''}`}
                onClick={() => setDateFilter('tomorrow')}
              >
                내일
              </button>
            </div>

            <div className="filter-row">
              <select
                className="field-input filter-select"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              >
                <option value="all">모든 상태</option>
                <option value="draft">초안</option>
                <option value="rendering">렌더링</option>
                <option value="preview_ready">미리보기 준비</option>
                <option value="approved">승인 완료</option>
                <option value="scheduled">예약 대기</option>
                <option value="publishing">배포 중</option>
                <option value="published">배포 완료</option>
                <option value="failed">실패</option>
              </select>
              <label className="toggle-inline">
                <input
                  className="toggle-checkbox"
                  type="checkbox"
                  checked={failedOnly}
                  onChange={(event) => setFailedOnly(event.target.checked)}
                />
                실패만 보기
              </label>
            </div>
          </div>

          <div className="card-list">
            {paginatedRows.map((row) => {
              const backgroundUrl = buildStoragePublicUrl(row.background_asset_path);
              const posterUrl = buildStoragePublicUrl(row.poster_asset_path);
              const previewUrl = row.app_playback_url || row.shortform_video_url || backgroundUrl;
              const renderJob = latestRenderJobs.get(row.id);
              const publishJobs = latestPublishJobs[row.id];
              const events = recentEvents.get(row.id) ?? [];
              const cardBusy = rowBusyKey?.endsWith(row.id);
              const publishedLocked = isPublishedLocked(row);
              const season = row.season_id ? seasonsById.get(row.season_id) : null;

              return (
                <article key={row.id} className="pipeline-card">
                  <div className="pipeline-card-top">
                    <div>
                      <p className="list-card-date">{row.content_date}</p>
                      <h4 className="list-card-title">{row.phrase}</h4>
                      {row.sub_phrase ? <p className="list-card-meta">{row.sub_phrase}</p> : null}
                      <p className="list-card-meta">
                        {season ? `${season.month_key} · ${season.title}` : '시즌 미연결'}
                        {' · '}
                        {getArchetypeLabel(row.archetype)}
                        {' · '}
                        {row.generator_provider ? GENERATOR_PROVIDER_LABELS[row.generator_provider] : 'provider 미선택'}
                      </p>
                    </div>
                    <div className="pipeline-status-stack">
                      <span className={`status-pill ${row.is_published ? 'status-pill-live' : ''}`}>
                        {WORKFLOW_STATUS_LABELS[row.workflow_status]}
                      </span>
                      {row.app_publish_status === 'approved_live' || row.is_published ? (
                        <button
                          type="button"
                          className="status-pill status-pill-live"
                          onClick={() =>
                            runRowAction(row, 'unpublish', `/api/content/${row.id}/unpublish`, '앱 공개 상태를 비공개로 바꿨습니다.')
                          }
                          disabled={Boolean(cardBusy)}
                          title="클릭하면 앱에서 비공개 처리됩니다."
                        >
                          게시중
                        </button>
                      ) : (
                        <span className="status-pill">
                          {APP_PUBLISH_STATUS_LABELS[row.app_publish_status]}
                        </span>
                      )}
                      <span className="status-pill">YT · {PLATFORM_PUBLISH_STATUS_LABELS[row.youtube_publish_status]}</span>
                      <span className="status-pill">IG · {PLATFORM_PUBLISH_STATUS_LABELS[row.instagram_publish_status]}</span>
                      <span className="status-pill">MODE · {row.publish_mode === 'scheduled' ? '예약' : '즉시'}</span>
                      {publishedLocked ? <span className="status-pill">LOCKED</span> : null}
                    </div>
                  </div>

                  <p className="list-card-body">{row.description}</p>

                  <div className="media-preview-shell">
                    {previewUrl ? (
                      <video
                        className="media-preview-video"
                        src={previewUrl}
                        poster={posterUrl || undefined}
                        autoPlay
                        muted
                        loop
                        playsInline
                      />
                    ) : (
                      <div className="media-preview-empty">Drive 또는 배경 영상을 아직 연결하지 않았습니다.</div>
                    )}
                  </div>

                  <div className="meta-grid">
                    <p className="list-card-meta">정답 문구: {row.phrase}</p>
                    <p className="list-card-meta">보상 링크: {row.reward_url || '없음'}</p>
                    <p className="list-card-meta">Drive 파일: {row.drive_file_id || '미등록'}</p>
                    <p className="list-card-meta">Drive 공유 URL: {row.drive_share_url || '미등록'}</p>
                    <p className="list-card-meta">앱 재생 URL: {row.app_playback_url || '미해석'}</p>
                    <p className="list-card-meta">배경 경로: {row.background_asset_path || '미업로드'}</p>
                    <p className="list-card-meta">숏폼 URL: {row.shortform_video_url || '렌더 대기'}</p>
                    <p className="list-card-meta">프롬프트 초안: {row.generation_prompt_draft ? '저장됨' : '미생성'}</p>
                    <p className="list-card-meta">프롬프트 최종본: {row.generation_prompt_final ? '저장됨' : '미입력'}</p>
                    <p className="list-card-meta">예약 시각: {row.publish_at ? new Date(row.publish_at).toLocaleString('ko-KR') : '없음'}</p>
                    <p className="list-card-meta">마지막 에러: {row.last_error || '없음'}</p>
                    <p className="list-card-meta">YT 에러: {row.youtube_last_error || '없음'}</p>
                    <p className="list-card-meta">IG 에러: {row.instagram_last_error || '없음'}</p>
                  </div>

                  <div className="job-strip">
                    <span className="job-pill">RENDER · {renderJob?.status ?? 'none'}</span>
                    <span className="job-pill">YT JOB · {publishJobs?.youtube?.status ?? 'none'}</span>
                    <span className="job-pill">IG JOB · {publishJobs?.instagram?.status ?? 'none'}</span>
                  </div>

                  <div className="event-timeline">
                    {events.length > 0 ? (
                      events.map((event) => (
                        <div key={event.id} className="event-row">
                          <span className="event-pill">{CONTENT_EVENT_LABELS[event.event_type]}</span>
                          <span className="event-time">
                            {formatEventTime(event.created_at)}
                            {event.actor_email ? ` · ${event.actor_email}` : ''}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="list-card-meta">최근 이벤트가 아직 없습니다.</p>
                    )}
                  </div>

                  <div className="upload-row">
                    <label className="upload-button">
                      <span>{cardBusy ? '업로드 중...' : '배경 영상 업로드'}</span>
                      <input
                        type="file"
                        accept="video/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          if (file) {
                            handleUploadBackground(row, file).catch(() => undefined);
                          }
                          event.currentTarget.value = '';
                        }}
                        disabled={Boolean(cardBusy) || publishedLocked}
                      />
                    </label>
                    <span className="upload-hint">
                      {publishedLocked
                        ? '게시 후에는 배경 영상을 바꿀 수 없습니다.'
                        : '세로형 9:16 배경 영상을 넣으면 렌더러가 텍스트를 합성합니다.'}
                    </span>
                  </div>

                  <div className="card-actions card-actions-wrap">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => handleEdit(row)}
                      disabled={Boolean(cardBusy) || ['rendering', 'publishing'].includes(row.workflow_status)}
                    >
                      {publishedLocked ? '허용 필드 편집' : '수정'}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        runRowAction(row, 'prompt', `/api/content/${row.id}/generate-prompt`, '프롬프트 초안을 생성했습니다.')
                      }
                      disabled={Boolean(cardBusy) || publishedLocked}
                    >
                      프롬프트 초안
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        runRowAction(row, 'drive', `/api/content/${row.id}/resolve-drive-asset`, 'Drive 원본을 앱 재생 링크로 해석했습니다.')
                      }
                      disabled={!canResolveDriveAsset(row) || Boolean(cardBusy)}
                    >
                      Drive 해석
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        runRowAction(row, 'render', `/api/content/${row.id}/render`, '렌더 작업을 큐에 넣었습니다.')
                      }
                      disabled={!canRequestRender(row) || Boolean(cardBusy)}
                    >
                      Render preview
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        runApproveAction(row).catch(() => undefined)
                      }
                      disabled={!((row.publish_mode === 'scheduled' && canApproveContent(row)) || (row.publish_mode !== 'scheduled' && canApproveAndPublish(row))) || Boolean(cardBusy)}
                    >
                      {getApproveActionConfig(row).label}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        runRowAction(row, 'publish-now', `/api/content/${row.id}/publish-now`, '즉시 공개를 시작했습니다.')
                      }
                      disabled={!canPublishNow(row) || Boolean(cardBusy)}
                    >
                      즉시 게시
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        runRowAction(row, 'retry-render', `/api/content/${row.id}/retry-render`, '렌더 재시도를 큐에 넣었습니다.')
                      }
                      disabled={!canRetryRender(row) || Boolean(cardBusy)}
                    >
                      렌더 재시도
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        runRowAction(row, 'retry-youtube', `/api/content/${row.id}/retry-platform?platform=youtube`, 'YouTube 게시 재시도를 큐에 넣었습니다.')
                      }
                      disabled={!canRetryPlatform(row, 'youtube') || Boolean(cardBusy)}
                    >
                      YouTube 재시도
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        runRowAction(row, 'retry-instagram', `/api/content/${row.id}/retry-platform?platform=instagram`, 'Instagram 게시 재시도를 큐에 넣었습니다.')
                      }
                      disabled={!canRetryPlatform(row, 'instagram') || Boolean(cardBusy)}
                    >
                      Instagram 재시도
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => handleDelete(row).catch(() => undefined)}
                      disabled={busy || publishedLocked}
                    >
                      삭제
                    </button>
                  </div>
                </article>
              );
            })}
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
