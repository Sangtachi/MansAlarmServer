import { adminEnv } from './env';
import {
  addDaysToYmd,
  buildUpcomingDrafts,
  GeneratedDailyContentDraft,
  isContentArchetype,
} from './contentGenerator';
import { buildDefaultSocialCaption } from './contentPipeline';
import { buildPromptDraft } from './contentStudio';
import { ContentArchetype, ContentSeasonRow, GeneratorProvider, PublishMode } from './types';

type GenerateDraftParams = {
  startDate: string;
  days: number;
  seasons: ContentSeasonRow[];
  preferredSeasonId: string | null;
  generatorProvider: GeneratorProvider;
  seedArchetype: ContentArchetype | null;
  publishMode: PublishMode;
  existingPhrases?: string[];
};

type ProviderResult = {
  drafts: GeneratedDailyContentDraft[];
  backend: 'ollama' | 'deterministic';
  usedFallback: boolean;
  fallbackReason: string | null;
  model?: string | null;
  modelAttempts?: Array<{
    model: string;
    success: boolean;
    fallbackReason: string | null;
  }>;
};

type OllamaDraft = {
  contentDate: string;
  archetype: string;
  phrase: string;
  subPhrase: string;
  description: string;
  socialCaption: string;
};

type OllamaResponsePayload = {
  drafts?: OllamaDraft[];
};

const ALLOWED_ARCHETYPES: ContentArchetype[] = ['knight', 'orc', 'barbarian', 'elf', 'exile'];
const FORBIDDEN_PHRASE_PARTS = [
  '죽',
  '살해',
  '자살',
  '혐오',
  '욕설',
  '섹스',
  '도박',
  '마약',
  '광고',
  '무료',
  '구독',
  '팔로우',
  '클릭',
];
const LOW_QUALITY_PHRASE_PARTS = [
  '하는',
  '하세요',
  '주세요',
  '가세요',
  '에게',
  '에서',
  '으로',
  '부터',
  '까지',
  '라주',
  '번에',
];
const MEANINGFUL_PHRASE_PARTS = [
  '철',
  '혈',
  '강',
  '심',
  '불',
  '굴',
  '절',
  '제',
  '고',
  '독',
  '단',
  '련',
  '결',
  '연',
  '완',
  '수',
  '우',
  '직',
  '전',
  '진',
  '극',
  '기',
  '성',
  '취',
  '한',
  '계',
  '돌',
  '파',
  '근',
  '축',
  '적',
  '묵',
  '중',
  '행',
  '집',
  '념',
  '신',
  '속',
  '후',
  '퇴',
  '금',
  '지',
  '일',
  '관',
  '점',
  '화',
  '호',
  '흡',
  '장',
  '준',
  '비',
  '검',
  '날',
  '개',
  '왕',
  '승',
  '리',
  '목',
  '표',
];
const HANJA_BY_KOREAN_SYLLABLE: Record<string, string> = {
  행: '行',
  증: '證',
  자: '自',
  명: '明',
  침: '沈',
  묵: '默',
  결: '決',
  불: '不',
  굴: '屈',
  정: '精',
  진: '進',
  절: '節',
  제: '制',
  강: '强',
  고: '孤',
  독: '獨',
  단: '鍛',
  련: '鍊',
  연: '然',
  일: '一',
  도: '刀',
  철: '鐵',
  심: '心',
  완: '完',
  수: '遂',
  우: '愚',
  직: '直',
  전: '戰',
  고삐: '執轡',
  속: '速',
  기: '起',
  상: '床',
  극: '克',
  성: '成',
  취: '就',
  응: '凝',
  축: '縮',
  발: '發',
  력: '力',
  한: '限',
  계: '界',
  돌: '突',
  파: '破',
  근: '根',
  적: '積',
  집: '執',
  념: '念',
  신: '迅',
  후: '後',
  퇴: '退',
  금: '禁',
  지: '止',
  관: '貫',
  의: '意',
  점: '點',
  화: '火',
  호: '呼',
  흡: '吸',
  장: '場',
  준: '準',
  비: '備',
  혈: '血',
  앞: '前',
  승: '勝',
  리: '利',
  왕: '王',
  검: '劍',
  날: '刃',
  개: '開',
  목: '目',
  표: '標',
};
const HANJA_BY_KOREAN_PHRASE: Record<string, string> = {
  행증자명: '行證自明',
  침묵결행: '沈默決行',
  불굴정진: '不屈精進',
  절제강행: '節制强行',
  고독단련: '孤獨鍛鍊',
  결연일도: '決然一刀',
  철심완수: '鐵心完遂',
  우직전진: '愚直前進',
  강심지속: '强心持續',
  자기단속: '自己團束',
  목표집중: '目標集中',
  극기성취: '克己成就',
  한계돌파: '限界突破',
  기상철칙: '起床鐵則',
  근성축적: '根性蓄積',
  완급조절: '緩急調節',
  묵중수행: '默重修行',
  집념축성: '執念築成',
  신속결단: '迅速決斷',
  심지고정: '心志固定',
  후퇴금지: '後退禁止',
  일념관철: '一念貫徹',
  전장준비: '戰場準備',
  의지점화: '意志點火',
  강철호흡: '鋼鐵呼吸',
  철혈전진: '鐵血前進',
};
const MIN_PHRASE_LENGTH = 2;
const MAX_PHRASE_LENGTH = 8;
const MIN_SUB_PHRASE_LENGTH = 2;
const MAX_SUB_PHRASE_LENGTH = 8;

function buildSeasonSummaryForPrompt(seasons: ContentSeasonRow[]) {
  return seasons
    .map((season) => [
      `month_key: ${season.month_key}`,
      `title: ${season.title}`,
      `theme_family: ${season.theme_family}`,
      `season_summary: ${season.season_summary}`,
      `base_world_prompt: ${season.base_world_prompt}`,
      `visual_rules: ${season.visual_rules}`,
      `is_active: ${season.is_active}`,
    ].join('\n'))
    .join('\n\n');
}

function escapeForPrompt(value: string) {
  return value.replace(/```/g, '`');
}

function buildOutputSchema() {
  return {
    type: 'object',
    properties: {
      drafts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            contentDate: { type: 'string' },
            archetype: { type: 'string' },
            phrase: { type: 'string' },
            subPhrase: { type: 'string' },
            description: { type: 'string' },
            socialCaption: { type: 'string' },
          },
          required: ['contentDate', 'archetype', 'phrase', 'subPhrase', 'description', 'socialCaption'],
        },
      },
    },
    required: ['drafts'],
  };
}

function buildTargetDates(params: GenerateDraftParams) {
  return Array.from({ length: params.days }, (_, index) => addDaysToYmd(params.startDate, index));
}

function buildExistingPhraseSummary(params: GenerateDraftParams) {
  const phrases = Array.from(new Set((params.existingPhrases ?? []).map((phrase) => phrase.trim()).filter(Boolean)));
  if (phrases.length === 0) {
    return 'none';
  }

  return phrases.slice(-240).join(', ');
}

function buildPrompt(params: GenerateDraftParams, previousError?: string | null) {
  const targetDates = buildTargetDates(params);

  return [
    '너는 맨즈알림의 일일 멘트 생성기다.',
    '다크 판타지 전쟁 세계관을 유지하되, 실제 앱에서 쓰일 짧고 강한 문구를 만든다.',
    '응답은 반드시 JSON 스키마를 준수한다.',
    '각 날짜마다 정확히 1개의 draft를 만들어라.',
    'phrase는 한국어 2~8글자의 명사형 구호여야 한다. 공백, 조사, 숫자, 영어, 문장부호를 넣지 않는다.',
    'phrase 좋은 예: 철혈전진, 절제강행, 불굴정진, 전장준비, 강철호흡, 후퇴금지.',
    'phrase 나쁜 예: 하는에, 호라주, 영웅의 길, 전장의 왕, 주세요.',
    'subPhrase는 반드시 한자 2~8글자여야 한다. 한글, 공백, 숫자, 영어, 문장부호를 넣지 않는다.',
    'subPhrase 좋은 예: 鐵血前進, 節制強行, 不屈精進.',
    'description은 1~2문장, 30~140글자 사이로 만든다.',
    'socialCaption은 phrase, subPhrase, description을 포함하고 해시태그를 3~5개 넣는다.',
    '중복 phrase는 피한다.',
    '폭력 선동, 자해, 혐오, 성적 표현, 도박, 마약, 광고성 문구를 쓰지 않는다.',
    '',
    `target_dates: ${targetDates.join(', ')}`,
    `preferred_publish_mode: ${params.publishMode}`,
    `video_provider: ${params.generatorProvider}`,
    `seed_archetype: ${params.seedArchetype ?? 'none'}`,
    `allowed_archetypes: ${ALLOWED_ARCHETYPES.join(', ')}`,
    `existing_phrases_to_avoid: ${buildExistingPhraseSummary(params)}`,
    '',
    'content season context:',
    escapeForPrompt(buildSeasonSummaryForPrompt(params.seasons)),
    previousError ? `\n이전 응답 오류: ${escapeForPrompt(previousError)}` : '',
    '',
    '추가 규칙:',
    '- 날짜 문자열은 YYYY-MM-DD 형식 그대로 넣는다.',
    '- archetype은 allowed_archetypes 중 하나만 사용한다.',
    '- 과장된 영어 문구를 쓰지 않는다.',
    '- 앱에서 읽기 쉬운 짧은 문장으로 만든다.',
    '- socialCaption은 문단 2개 이내로 유지한다.',
  ].join('\n');
}

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'http://127.0.0.1:11434/api';
  }
  return trimmed.replace(/\/$/, '').endsWith('/api')
    ? trimmed.replace(/\/$/, '')
    : `${trimmed.replace(/\/$/, '')}/api`;
}

function hasForbiddenPhrasePart(value: string) {
  return FORBIDDEN_PHRASE_PARTS.some((part) => value.includes(part));
}

function hasLowQualityPhrasePart(value: string) {
  return LOW_QUALITY_PHRASE_PARTS.some((part) => value.includes(part));
}

function countMeaningfulPhraseParts(value: string) {
  return MEANINGFUL_PHRASE_PARTS.reduce((count, part) => count + (value.includes(part) ? 1 : 0), 0);
}

function deriveSubPhraseFromPhrase(phrase: string) {
  const phraseMatched = HANJA_BY_KOREAN_PHRASE[phrase];
  if (phraseMatched) {
    return phraseMatched;
  }

  const chars = [...phrase];
  const mapped = chars.map((char) => HANJA_BY_KOREAN_SYLLABLE[char] ?? '');
  if (mapped.some((char) => !char)) {
    return null;
  }
  return mapped.join('');
}

function isCompactKoreanPhrase(value: string, minLength: number, maxLength: number) {
  if (value.length < minLength || value.length > maxLength) {
    return false;
  }
  return /^[가-힣一-龥]+$/.test(value);
}

function validateTextFields(draft: OllamaDraft) {
  const phrase = draft.phrase.trim();
  const generatedSubPhrase = draft.subPhrase.trim();
  const description = draft.description.trim();
  const socialCaption = draft.socialCaption.trim();
  const subPhrase = deriveSubPhraseFromPhrase(phrase) ?? generatedSubPhrase;

  if (!phrase || !generatedSubPhrase || !description || !socialCaption) {
    throw new Error(`Incomplete generated content for ${draft.contentDate}`);
  }
  if (!isCompactKoreanPhrase(phrase, MIN_PHRASE_LENGTH, MAX_PHRASE_LENGTH)) {
    throw new Error(`Invalid phrase quality for ${draft.contentDate}: ${phrase}`);
  }
  if (hasLowQualityPhrasePart(phrase) || countMeaningfulPhraseParts(phrase) < 2) {
    throw new Error(`Low quality phrase for ${draft.contentDate}: ${phrase}`);
  }
  if (
    subPhrase.length < MIN_SUB_PHRASE_LENGTH
    || subPhrase.length > MAX_SUB_PHRASE_LENGTH
    || !/^[一-龥]+$/.test(subPhrase)
  ) {
    throw new Error(`Invalid subPhrase quality for ${draft.contentDate}: ${subPhrase}`);
  }
  if (description.length < 20 || description.length > 160) {
    throw new Error(`Invalid description length for ${draft.contentDate}`);
  }
  if (hasForbiddenPhrasePart(phrase) || hasForbiddenPhrasePart(subPhrase) || hasForbiddenPhrasePart(description)) {
    throw new Error(`Forbidden expression detected for ${draft.contentDate}`);
  }

  return {
    phrase,
    subPhrase,
    description,
    socialCaption: socialCaption.includes(phrase) && socialCaption.includes(subPhrase)
      ? socialCaption
      : buildDefaultSocialCaption(phrase, subPhrase, description),
  };
}

function toGeneratedDrafts(params: GenerateDraftParams, payload: OllamaResponsePayload, existingPhrases = new Set<string>()) {
  const drafts = Array.isArray(payload.drafts) ? payload.drafts : [];
  const seasonByMonth = new Map(params.seasons.map((season) => [season.month_key, season]));
  const expectedDates = new Set(buildTargetDates(params));
  const seenDates = new Set<string>();
  const seenPhrases = new Set(existingPhrases);

  if (drafts.length !== params.days) {
    throw new Error(`Expected ${params.days} generated drafts but received ${drafts.length}.`);
  }

  return drafts.map((draft) => {
    if (!expectedDates.has(draft.contentDate)) {
      throw new Error(`Unexpected contentDate from Ollama: ${draft.contentDate}`);
    }
    if (seenDates.has(draft.contentDate)) {
      throw new Error(`Duplicate contentDate from Ollama: ${draft.contentDate}`);
    }
    seenDates.add(draft.contentDate);

    if (!isContentArchetype(draft.archetype)) {
      throw new Error(`Invalid archetype from Ollama: ${draft.archetype}`);
    }

    const { phrase, subPhrase, description, socialCaption } = validateTextFields(draft);
    if (seenPhrases.has(phrase)) {
      throw new Error(`Duplicate phrase from Ollama: ${phrase}`);
    }
    seenPhrases.add(phrase);

    const season = seasonByMonth.get(draft.contentDate.slice(0, 7))
      ?? params.seasons.find((item) => item.id === params.preferredSeasonId)
      ?? params.seasons.find((item) => item.is_active)
      ?? params.seasons[0]
      ?? null;

    const generationPromptDraft = buildPromptDraft({
      season,
      archetype: draft.archetype,
      provider: params.generatorProvider,
      phrase,
      subPhrase,
      description,
    });

    return {
      contentDate: draft.contentDate,
      season,
      archetype: draft.archetype,
      generatorProvider: params.generatorProvider,
      phrase,
      subPhrase,
      description,
      socialCaption,
      generationPromptDraft,
      generationPromptFinal: generationPromptDraft,
      publishMode: params.publishMode,
      publishAt: params.publishMode === 'scheduled'
        ? new Date(`${draft.contentDate}T00:05:00+09:00`).toISOString()
        : null,
    } satisfies GeneratedDailyContentDraft;
  });
}

function getOllamaModelCandidates() {
  return [
    adminEnv.ollamaModel.trim(),
    ...adminEnv.ollamaModelCandidates.map((model) => model.trim()),
  ].filter((model, index, list) => Boolean(model) && list.indexOf(model) === index);
}

async function requestOllamaDrafts(params: GenerateDraftParams, model: string, previousError?: string | null) {
  if (!model) {
    throw new Error('OLLAMA_MODEL is empty.');
  }

  const response = await fetch(`${normalizeBaseUrl(adminEnv.ollamaBaseUrl)}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      stream: false,
      keep_alive: adminEnv.ollamaKeepAlive || '10m',
      format: buildOutputSchema(),
      options: {
        temperature: previousError ? 0.1 : 0.25,
        repeat_penalty: 1.12,
      },
      messages: [
        {
          role: 'system',
          content: 'Return only valid JSON that matches the provided schema. Do not add markdown fences.',
        },
        {
          role: 'user',
          content: buildPrompt(params, previousError),
        },
      ],
    }),
    signal: AbortSignal.timeout(adminEnv.ollamaTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Ollama chat request failed with status ${response.status}.`);
  }

  const payload = await response.json() as {
    message?: { content?: string };
  };
  const raw = payload.message?.content?.trim();
  if (!raw) {
    throw new Error('Ollama returned an empty response.');
  }

  let parsed: OllamaResponsePayload;
  try {
    parsed = JSON.parse(raw) as OllamaResponsePayload;
  } catch (error) {
    throw new Error(`Failed to parse Ollama JSON response: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  return parsed;
}

async function generateOneDayWithOllama(
  params: GenerateDraftParams,
  contentDate: string,
  model: string,
  existingPhrases: Set<string>,
) {
  const singleParams = {
    ...params,
    startDate: contentDate,
    days: 1,
  };
  let previousError: string | null = null;
  const maxAttempts = Math.max(1, adminEnv.ollamaRepairRetries + 1);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const payload = await requestOllamaDrafts(singleParams, model, previousError);
      const [draft] = toGeneratedDrafts(singleParams, payload, existingPhrases);
      existingPhrases.add(draft.phrase);
      return draft;
    } catch (error) {
      previousError = error instanceof Error ? error.message : 'Unknown Ollama error';
    }
  }

  throw new Error(previousError ?? `Ollama failed for ${contentDate}`);
}

function buildDeterministicDraftForDate(params: GenerateDraftParams, contentDate: string, existingPhrases: Set<string>) {
  for (let offset = 0; offset < 30; offset += 1) {
    const candidateDate = addDaysToYmd(contentDate, offset);
    const [candidate] = buildUpcomingDrafts({
      ...params,
      startDate: candidateDate,
      days: 1,
    });

    if (!existingPhrases.has(candidate.phrase) || offset === 29) {
      const normalized = {
        ...candidate,
        contentDate,
        publishAt: params.publishMode === 'scheduled'
          ? new Date(`${contentDate}T00:05:00+09:00`).toISOString()
          : null,
      };
      return normalized;
    }
  }

  return buildUpcomingDrafts({
    ...params,
    startDate: contentDate,
    days: 1,
  })[0];
}

async function generateOneDayWithProvider(
  params: GenerateDraftParams,
  contentDate: string,
  models: string[],
  existingPhrases: Set<string>,
) {
  const modelAttempts: NonNullable<ProviderResult['modelAttempts']> = [];

  for (const model of models) {
    try {
      const draft = await generateOneDayWithOllama(params, contentDate, model, existingPhrases);
      modelAttempts.push({ model, success: true, fallbackReason: null });
      return {
        draft,
        usedOllama: true,
        usedFallback: false,
        fallbackReason: null,
        model,
        modelAttempts,
      };
    } catch (error) {
      modelAttempts.push({
        model,
        success: false,
        fallbackReason: error instanceof Error ? error.message : 'Unknown Ollama error',
      });
    }
  }

  const fallbackDraft = buildDeterministicDraftForDate(params, contentDate, existingPhrases);
  existingPhrases.add(fallbackDraft.phrase);
  return {
    draft: fallbackDraft,
    usedOllama: false,
    usedFallback: true,
    fallbackReason: modelAttempts.map((attempt) => `${attempt.model}: ${attempt.fallbackReason}`).join(' | ') || `No Ollama model configured for ${contentDate}`,
    model: null,
    modelAttempts,
  };
}

async function generateWithOllamaDaily(params: GenerateDraftParams, models: string[]) {
  const dates = buildTargetDates(params);
  const existingPhrases = new Set(params.existingPhrases ?? []);
  const drafts: GeneratedDailyContentDraft[] = [];
  const modelAttempts: NonNullable<ProviderResult['modelAttempts']> = [];
  const fallbackReasons: string[] = [];
  let ollamaSuccessCount = 0;
  let selectedModel: string | null = null;

  for (const contentDate of dates) {
    const result = await generateOneDayWithProvider(params, contentDate, models, existingPhrases);
    drafts.push(result.draft);
    modelAttempts.push(...result.modelAttempts.map((attempt) => ({
      ...attempt,
      model: `${contentDate}:${attempt.model}`,
    })));

    if (result.usedOllama) {
      ollamaSuccessCount += 1;
      selectedModel ??= result.model;
    }
    if (result.usedFallback && result.fallbackReason) {
      fallbackReasons.push(`${contentDate}: ${result.fallbackReason}`);
    }
  }

  return {
    drafts,
    ollamaSuccessCount,
    selectedModel,
    usedFallback: fallbackReasons.length > 0,
    fallbackReason: fallbackReasons.length ? fallbackReasons.join(' | ') : null,
    modelAttempts,
  };
}

function generateWithDeterministicDaily(params: GenerateDraftParams) {
  const dates = buildTargetDates(params);
  const existingPhrases = new Set(params.existingPhrases ?? []);
  const drafts = dates.map((contentDate) => {
    const draft = buildDeterministicDraftForDate(params, contentDate, existingPhrases);
    existingPhrases.add(draft.phrase);
    return draft;
  });

  return drafts;
}

export async function generateUpcomingDraftsWithProvider(params: GenerateDraftParams): Promise<ProviderResult> {
  const backend = adminEnv.contentGeneratorBackend;

  if (backend === 'ollama' && adminEnv.ollamaEnabled) {
    const modelCandidates = getOllamaModelCandidates();
    const generation = await generateWithOllamaDaily(params, modelCandidates);
    const anyOllamaSuccess = generation.ollamaSuccessCount > 0;

    return {
      drafts: generation.drafts,
      backend: anyOllamaSuccess ? 'ollama' : 'deterministic',
      usedFallback: generation.usedFallback,
      fallbackReason: generation.fallbackReason,
      model: generation.selectedModel,
      modelAttempts: generation.modelAttempts,
    };
  }

  return {
    drafts: generateWithDeterministicDaily(params),
    backend: 'deterministic',
    usedFallback: false,
    fallbackReason: null,
    model: null,
    modelAttempts: [],
  };
}

export function getContentGeneratorStatus() {
  const backend = adminEnv.contentGeneratorBackend;
  const models = getOllamaModelCandidates();
  return {
    backend,
    enabled: backend === 'ollama' ? adminEnv.ollamaEnabled : true,
    model: backend === 'ollama' ? (models[0] ?? '') : 'deterministic-template',
    modelCandidates: backend === 'ollama' ? models : [],
    baseUrl: backend === 'ollama' ? normalizeBaseUrl(adminEnv.ollamaBaseUrl) : '',
  };
}
