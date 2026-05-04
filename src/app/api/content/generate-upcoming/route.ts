import { NextRequest, NextResponse } from 'next/server';

import {
  GENERATED_DRAFT_WINDOW_LIMIT,
  addDaysToYmd,
  buildScheduledPublishAtIso,
  GeneratedDailyContentDraft,
  getKstTodayYmd,
  isContentArchetype,
  isGeneratorProvider,
  isPublishMode,
} from '@/lib/contentGenerator';
import { generateUpcomingDraftsWithProvider } from '@/lib/contentGeneratorProvider';
import { buildDefaultSocialCaption } from '@/lib/contentPipeline';
import { logContentEvent } from '@/lib/contentOperations';
import { buildPromptDraft } from '@/lib/contentStudio';
import { getAdminRouteContext } from '@/lib/serverAuth';
import { ContentArchetype, ContentSeasonRow, DailyContentRow, GeneratorProvider, PublishMode } from '@/lib/types';

type GenerateUpcomingRequest = {
  days?: number;
  startDate?: string;
  seasonId?: string | null;
  generatorProvider?: GeneratorProvider;
  archetype?: ContentArchetype;
  publishMode?: PublishMode;
};

function isValidYmd(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

type ReusableContentRow = Pick<
  DailyContentRow,
  | 'id'
  | 'content_date'
  | 'season_id'
  | 'archetype'
  | 'generator_provider'
  | 'phrase'
  | 'sub_phrase'
  | 'description'
  | 'reward_url'
  | 'social_caption'
>;

function resolveSeasonForDate(
  contentDate: string,
  seasons: ContentSeasonRow[],
  preferredSeasonId: string | null,
) {
  const monthKey = contentDate.slice(0, 7);
  const preferredSeason = preferredSeasonId
    ? seasons.find((season) => season.id === preferredSeasonId) ?? null
    : null;

  if (preferredSeason?.month_key === monthKey) {
    return preferredSeason;
  }

  return seasons.find((season) => season.month_key === monthKey && season.is_active)
    ?? seasons.find((season) => season.month_key === monthKey)
    ?? preferredSeason
    ?? seasons.find((season) => season.is_active)
    ?? seasons[0]
    ?? null;
}

function findReusableContent(contentDate: string, reusableRows: ReusableContentRow[]) {
  const monthDay = contentDate.slice(5);
  return reusableRows.find((row) => row.content_date < contentDate && row.content_date.slice(5) === monthDay) ?? null;
}

function buildReusedDraft(params: {
  contentDate: string;
  source: ReusableContentRow;
  season: ContentSeasonRow | null;
  generatorProvider: GeneratorProvider;
  seedArchetype: ContentArchetype | null;
  publishMode: PublishMode;
}): GeneratedDailyContentDraft {
  const archetype = params.seedArchetype ?? params.source.archetype ?? 'knight';
  const provider = params.source.generator_provider ?? params.generatorProvider;
  const socialCaption = params.source.social_caption?.trim()
    || buildDefaultSocialCaption(params.source.phrase, params.source.sub_phrase, params.source.description);
  const promptDraft = buildPromptDraft({
    season: params.season,
    archetype,
    provider,
    phrase: params.source.phrase,
    subPhrase: params.source.sub_phrase,
    description: params.source.description,
  });

  return {
    contentDate: params.contentDate,
    season: params.season,
    archetype,
    generatorProvider: provider,
    phrase: params.source.phrase,
    subPhrase: params.source.sub_phrase,
    description: params.source.description,
    socialCaption,
    generationPromptDraft: promptDraft,
    generationPromptFinal: promptDraft,
    publishMode: params.publishMode,
    publishAt: params.publishMode === 'scheduled' ? buildScheduledPublishAtIso(params.contentDate) : null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, email } = await getAdminRouteContext(request);
    const payload = (await request.json().catch(() => ({}))) as GenerateUpcomingRequest;

    const days = Math.min(
      GENERATED_DRAFT_WINDOW_LIMIT,
      Math.max(1, Number.isFinite(payload.days) ? Number(payload.days) : 7),
    );
    const startDate = typeof payload.startDate === 'string' && isValidYmd(payload.startDate)
      ? payload.startDate
      : addDaysToYmd(getKstTodayYmd(), 1);
    const preferredSeasonId = typeof payload.seasonId === 'string' && payload.seasonId.trim()
      ? payload.seasonId.trim()
      : null;
    const generatorProvider = typeof payload.generatorProvider === 'string' && isGeneratorProvider(payload.generatorProvider)
      ? payload.generatorProvider
      : 'veo';
    const seedArchetype = typeof payload.archetype === 'string' && isContentArchetype(payload.archetype)
      ? payload.archetype
      : null;
    const publishMode = typeof payload.publishMode === 'string' && isPublishMode(payload.publishMode)
      ? payload.publishMode
      : 'scheduled';

    const seasonsResult = await supabase
      .from('content_seasons')
      .select('*')
      .order('month_key', { ascending: false });

    if (seasonsResult.error) {
      return NextResponse.json({ error: seasonsResult.error.message }, { status: 400 });
    }

    const seasons = (seasonsResult.data ?? []) as ContentSeasonRow[];
    if (seasons.length === 0) {
      return NextResponse.json({ error: '자동 초안을 만들기 전에 월 시즌을 먼저 저장해야 합니다.' }, { status: 400 });
    }

    if (preferredSeasonId && !seasons.some((season) => season.id === preferredSeasonId)) {
      return NextResponse.json({ error: '선택한 시즌을 찾을 수 없습니다.' }, { status: 400 });
    }

    const targetDates = Array.from({ length: days }, (_, index) => addDaysToYmd(startDate, index));

    const existingResult = await supabase
      .from('daily_contents')
      .select('id, content_date, phrase')
      .in('content_date', targetDates)
      .order('content_date', { ascending: true });

    if (existingResult.error) {
      return NextResponse.json({ error: existingResult.error.message }, { status: 400 });
    }

    const phraseResult = await supabase
      .from('daily_contents')
      .select('phrase')
      .not('phrase', 'is', null);

    if (phraseResult.error) {
      return NextResponse.json({ error: phraseResult.error.message }, { status: 400 });
    }

    const reusableResult = await supabase
      .from('daily_contents')
      .select('id, content_date, season_id, archetype, generator_provider, phrase, sub_phrase, description, reward_url, social_caption')
      .lt('content_date', targetDates[targetDates.length - 1] ?? startDate)
      .order('content_date', { ascending: false });

    if (reusableResult.error) {
      return NextResponse.json({ error: reusableResult.error.message }, { status: 400 });
    }

    const existingRows = (existingResult.data ?? []) as Array<Pick<DailyContentRow, 'id' | 'content_date' | 'phrase'>>;
    const existingDateSet = new Set(existingRows.map((row) => row.content_date));
    const existingPhrases = (phraseResult.data ?? [])
      .map((row) => (typeof row.phrase === 'string' ? row.phrase.trim() : ''))
      .filter(Boolean);
    const existingPhraseSet = new Set(existingPhrases);
    const reusableRows = (reusableResult.data ?? []) as ReusableContentRow[];
    const reusedSourceByDate = new Map<string, ReusableContentRow>();
    const drafts: GeneratedDailyContentDraft[] = [];
    const modelAttempts: Array<{ model: string; success: boolean; fallbackReason: string | null }> = [];
    const fallbackReasons: string[] = [];
    let ollamaGeneratedCount = 0;
    let selectedGenerationModel: string | null = null;

    for (const contentDate of targetDates) {
      if (existingDateSet.has(contentDate)) {
        continue;
      }

      const reusableSource = findReusableContent(contentDate, reusableRows);
      if (reusableSource) {
        const draft = buildReusedDraft({
          contentDate,
          source: reusableSource,
          season: resolveSeasonForDate(contentDate, seasons, preferredSeasonId),
          generatorProvider,
          seedArchetype,
          publishMode,
        });
        drafts.push(draft);
        reusedSourceByDate.set(contentDate, reusableSource);
        existingPhraseSet.add(draft.phrase);
        continue;
      }

      const generation = await generateUpcomingDraftsWithProvider({
        startDate: contentDate,
        days: 1,
        seasons,
        preferredSeasonId,
        generatorProvider,
        seedArchetype,
        publishMode,
        existingPhrases: Array.from(existingPhraseSet),
      });
      const [draft] = generation.drafts;
      if (draft) {
        drafts.push(draft);
        existingPhraseSet.add(draft.phrase);
      }
      modelAttempts.push(...(generation.modelAttempts ?? []));
      if (generation.backend === 'ollama') {
        ollamaGeneratedCount += 1;
        selectedGenerationModel ??= generation.model ?? null;
      }
      if (generation.usedFallback && generation.fallbackReason) {
        fallbackReasons.push(generation.fallbackReason);
      }
    }

    const draftsToInsert = drafts.sort(
      (left, right) => targetDates.indexOf(left.contentDate) - targetDates.indexOf(right.contentDate),
    );
    const reusedDates = draftsToInsert
      .filter((draft) => reusedSourceByDate.has(draft.contentDate))
      .map((draft) => draft.contentDate);
    const generationBackend = ollamaGeneratedCount > 0 ? 'ollama' : 'deterministic';
    const usedFallback = fallbackReasons.length > 0;
    const fallbackReason = fallbackReasons.length ? fallbackReasons.join(' | ') : null;

    if (draftsToInsert.length === 0) {
      return NextResponse.json({
        ok: true,
        createdCount: 0,
        skippedCount: targetDates.length,
        reusedCount: 0,
        createdDates: [],
        skippedDates: targetDates,
        reusedDates: [],
        startDate,
        endDate: targetDates[targetDates.length - 1] ?? startDate,
        generationBackend,
        usedFallback,
        fallbackReason,
        generationModel: selectedGenerationModel,
        modelAttempts,
      });
    }

    const insertPayload = draftsToInsert.map((draft) => ({
      content_date: draft.contentDate,
      season_id: draft.season?.id ?? preferredSeasonId,
      archetype: draft.archetype,
      generator_provider: draft.generatorProvider,
      phrase: draft.phrase,
      sub_phrase: draft.subPhrase,
      description: draft.description,
      generation_prompt_draft: draft.generationPromptDraft,
      generation_prompt_final: draft.generationPromptFinal,
      drive_file_id: null,
      drive_share_url: null,
      app_playback_url: null,
      app_publish_status: 'draft',
      reward_url: null,
      reward_title: null,
      reward_artist: null,
      reward_video_id: null,
      social_caption: draft.socialCaption,
      publish_mode: draft.publishMode,
      publish_at: draft.publishAt,
      workflow_status: 'draft',
      is_published: false,
      youtube_publish_status: 'pending',
      instagram_publish_status: 'pending',
      youtube_last_error: null,
      instagram_last_error: null,
      shortform_video_url: null,
      poster_asset_path: null,
      background_asset_path: null,
      active_publish_request_id: null,
      approved_at: null,
      published_at: null,
      youtube_video_id: null,
      youtube_url: null,
      instagram_media_id: null,
      instagram_url: null,
      last_error: null,
    }));

    const insertResult = await supabase
      .from('daily_contents')
      .insert(insertPayload)
      .select('id, content_date, phrase');

    if (insertResult.error) {
      return NextResponse.json({ error: insertResult.error.message }, { status: 400 });
    }

    const insertedRows = (insertResult.data ?? []) as Array<Pick<DailyContentRow, 'id' | 'content_date' | 'phrase'>>;
    const detailByDate = new Map(draftsToInsert.map((draft) => [draft.contentDate, draft]));

    for (const row of insertedRows) {
      const draft = detailByDate.get(row.content_date);
      if (!draft) {
        continue;
      }
      try {
        await logContentEvent(supabase, {
          dailyContentId: row.id,
          eventType: 'content_created',
          actorEmail: email,
          detail: {
            source: reusedSourceByDate.has(row.content_date)
              ? 'annual_reuse_generator'
              : generationBackend === 'ollama'
                ? 'ollama_upcoming_generator'
                : 'auto_upcoming_generator',
            contentDate: row.content_date,
            phrase: draft.phrase,
            seasonId: draft.season?.id ?? preferredSeasonId,
            archetype: draft.archetype,
            provider: draft.generatorProvider,
            publishMode: draft.publishMode,
            publishAt: draft.publishAt,
            reusedFromContentId: reusedSourceByDate.get(row.content_date)?.id ?? null,
            reusedFromContentDate: reusedSourceByDate.get(row.content_date)?.content_date ?? null,
            usedFallback,
            fallbackReason,
            generationModel: selectedGenerationModel,
            modelAttempts,
          },
        });
      } catch (eventError) {
        console.error('[generate-upcoming route] content_events insert failed', eventError);
      }
    }

    return NextResponse.json({
      ok: true,
      createdCount: insertedRows.length,
      skippedCount: targetDates.length - insertedRows.length,
      reusedCount: reusedDates.length,
      createdDates: insertedRows.map((row) => row.content_date),
      skippedDates: targetDates.filter((date) => existingDateSet.has(date)),
      reusedDates,
      startDate,
      endDate: targetDates[targetDates.length - 1] ?? startDate,
      generationBackend,
      usedFallback,
      fallbackReason,
      generationModel: selectedGenerationModel,
      modelAttempts,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '자동 초안 생성에 실패했습니다.' },
      { status: 401 },
    );
  }
}
