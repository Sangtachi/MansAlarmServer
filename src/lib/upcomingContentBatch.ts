import type { SupabaseClient } from '@supabase/supabase-js';

import {
  GENERATED_DRAFT_WINDOW_LIMIT,
  addDaysToYmd,
  GeneratedDailyContentDraft,
} from './contentGenerator';
import { generateUpcomingDraftsWithProvider } from './contentGeneratorProvider';
import { logContentEvent } from './contentOperations';
import { buildDailyContentInsertRow } from './dailyContentCronInsert';
import {
  buildReusedDraft,
  findReusableContent,
  resolveSeasonForDate,
  ReusableContentRow,
} from './upcomingContentShared';
import {
  ContentArchetype,
  ContentSeasonRow,
  DailyContentRow,
  GeneratorProvider,
  PublishMode,
} from './types';

export type EnsureUpcomingContentParams = {
  startDate: string;
  days: number;
  preferredSeasonId: string | null;
  generatorProvider: GeneratorProvider;
  seedArchetype: ContentArchetype | null;
  publishMode: PublishMode;
  actorEmail: string;
  source: string;
};

export async function ensureUpcomingContentDrafts(
  supabase: SupabaseClient,
  params: EnsureUpcomingContentParams,
) {
  const days = Math.min(GENERATED_DRAFT_WINDOW_LIMIT, Math.max(1, params.days));
  const targetDates = Array.from({ length: days }, (_, index) => addDaysToYmd(params.startDate, index));

  const seasonsResult = await supabase
    .from('content_seasons')
    .select('*')
    .order('month_key', { ascending: false });

  if (seasonsResult.error) {
    throw new Error(seasonsResult.error.message);
  }

  const seasons = (seasonsResult.data ?? []) as ContentSeasonRow[];
  if (seasons.length === 0) {
    throw new Error('content_seasons is empty; create a season before generating daily contents.');
  }

  const existingResult = await supabase
    .from('daily_contents')
    .select('id, content_date, phrase')
    .in('content_date', targetDates)
    .order('content_date', { ascending: true });

  if (existingResult.error) {
    throw new Error(existingResult.error.message);
  }

  const phraseResult = await supabase
    .from('daily_contents')
    .select('phrase')
    .not('phrase', 'is', null);

  if (phraseResult.error) {
    throw new Error(phraseResult.error.message);
  }

  const reusableResult = await supabase
    .from('daily_contents')
    .select('id, content_date, season_id, archetype, generator_provider, phrase, sub_phrase, description, reward_url, social_caption')
    .lt('content_date', targetDates[targetDates.length - 1] ?? params.startDate)
    .order('content_date', { ascending: false });

  if (reusableResult.error) {
    throw new Error(reusableResult.error.message);
  }

  const existingRows = (existingResult.data ?? []) as Array<Pick<DailyContentRow, 'id' | 'content_date' | 'phrase'>>;
  const existingDateSet = new Set(existingRows.map((row) => row.content_date));
  const existingPhraseSet = new Set(
    (phraseResult.data ?? [])
      .map((row) => (typeof row.phrase === 'string' ? row.phrase.trim() : ''))
      .filter(Boolean),
  );
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
        season: resolveSeasonForDate(contentDate, seasons, params.preferredSeasonId),
        generatorProvider: params.generatorProvider,
        seedArchetype: params.seedArchetype,
        publishMode: params.publishMode,
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
      preferredSeasonId: params.preferredSeasonId,
      generatorProvider: params.generatorProvider,
      seedArchetype: params.seedArchetype,
      publishMode: params.publishMode,
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
    return {
      ok: true,
      createdCount: 0,
      skippedCount: targetDates.length,
      reusedCount: 0,
      createdDates: [],
      skippedDates: targetDates,
      reusedDates: [],
      targetDates,
      startDate: params.startDate,
      endDate: targetDates[targetDates.length - 1] ?? params.startDate,
      generationBackend,
      usedFallback,
      fallbackReason,
      generationModel: selectedGenerationModel,
      modelAttempts,
    };
  }

  const insertPayload = draftsToInsert.map((draft) => buildDailyContentInsertRow(draft, params.preferredSeasonId));
  const insertResult = await supabase
    .from('daily_contents')
    .insert(insertPayload)
    .select('id, content_date, phrase');

  if (insertResult.error) {
    throw new Error(insertResult.error.message);
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
        actorEmail: params.actorEmail,
        detail: {
          source: reusedSourceByDate.has(row.content_date)
            ? 'annual_reuse_generator'
            : generationBackend === 'ollama'
              ? 'ollama_upcoming_generator'
              : params.source,
          contentDate: row.content_date,
          phrase: draft.phrase,
          seasonId: draft.season?.id ?? params.preferredSeasonId,
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
      console.error('[upcomingContentBatch] content_events insert failed', eventError);
    }
  }

  return {
    ok: true,
    createdCount: insertedRows.length,
    skippedCount: targetDates.length - insertedRows.length,
    reusedCount: reusedDates.length,
    createdDates: insertedRows.map((row) => row.content_date),
    skippedDates: targetDates.filter((date) => existingDateSet.has(date)),
    reusedDates,
    targetDates,
    startDate: params.startDate,
    endDate: targetDates[targetDates.length - 1] ?? params.startDate,
    generationBackend,
    usedFallback,
    fallbackReason,
    generationModel: selectedGenerationModel,
    modelAttempts,
  };
}
