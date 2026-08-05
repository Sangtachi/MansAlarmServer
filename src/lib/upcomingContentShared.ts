import { buildDefaultSocialCaption } from './contentPipeline';
import { buildPromptDraft } from './contentStudio';
import { buildScheduledPublishAtIso, GeneratedDailyContentDraft } from './contentGenerator';
import { ContentArchetype, ContentSeasonRow, DailyContentRow, GeneratorProvider, PublishMode } from './types';

export type ReusableContentRow = Pick<
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

export function resolveSeasonForDate(
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

export function findReusableContent(contentDate: string, reusableRows: ReusableContentRow[]) {
  const monthDay = contentDate.slice(5);
  return reusableRows.find((row) => row.content_date < contentDate && row.content_date.slice(5) === monthDay) ?? null;
}

export function buildReusedDraft(params: {
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
