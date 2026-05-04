import { buildPromptDraft, getArchetypeLabel, monthKeyFromDate } from './contentStudio';
import { buildDefaultSocialCaption } from './contentPipeline';
import {
  ContentArchetype,
  ContentSeasonRow,
  GeneratorProvider,
  PublishMode,
} from './types';

export const GENERATED_DRAFT_WINDOW_LIMIT = 30;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ARCHETYPE_ROTATION: ContentArchetype[] = ['knight', 'orc', 'barbarian', 'elf', 'exile'];

const CONTENT_LIBRARY = [
  {
    phrase: '행증자명',
    subPhrase: '行證自明',
    summary: '행동이 스스로를 증명한다. 말이 아니라 결과로 자신을 드러낸다.',
  },
  {
    phrase: '침묵결행',
    subPhrase: '沈默決行',
    summary: '시끄러운 선언보다 조용한 실행이 먼저다. 오늘은 움직임으로 답한다.',
  },
  {
    phrase: '불굴정진',
    subPhrase: '不屈精進',
    summary: '꺾여도 방향은 바꾸지 않는다. 조금 느려도 끝까지 밀고 나간다.',
  },
  {
    phrase: '절제강행',
    subPhrase: '節制強行',
    summary: '충동을 다스린 힘이 가장 오래 간다. 절제가 결국 전진을 만든다.',
  },
  {
    phrase: '고독단련',
    subPhrase: '孤獨鍛鍊',
    summary: '혼자 버티는 시간에 실력이 생긴다. 고요한 반복이 몸을 바꾼다.',
  },
  {
    phrase: '결연일도',
    subPhrase: '決然一刀',
    summary: '망설임을 끊는 한 번의 결단이 흐름을 바꾼다. 오늘은 미루지 않는다.',
  },
  {
    phrase: '철심완수',
    subPhrase: '鐵心完遂',
    summary: '차가운 마음으로 끝까지 완수한다. 시작보다 마무리가 진짜 실력이다.',
  },
  {
    phrase: '우직전진',
    subPhrase: '愚直前進',
    summary: '영리한 핑계보다 우직한 전진이 낫다. 오늘도 한 칸이라도 더 나아간다.',
  },
  {
    phrase: '고삐절제',
    subPhrase: '執轡節制',
    summary: '자신을 붙드는 사람이 끝내 흐름을 지배한다. 통제력이 승부를 가른다.',
  },
  {
    phrase: '강심지속',
    subPhrase: '强心持續',
    summary: '강한 마음은 큰 함성보다 긴 지속에서 드러난다. 오늘은 끊기지 않는다.',
  },
  {
    phrase: '자기단속',
    subPhrase: '自己團束',
    summary: '자기 단속이 무너지면 모든 계획이 흐려진다. 기본부터 다시 조인다.',
  },
  {
    phrase: '목표집중',
    subPhrase: '目標集中',
    summary: '시선을 흩트리지 않는다. 오늘 필요한 한 가지에 힘을 모은다.',
  },
  {
    phrase: '지연무언',
    subPhrase: '遲延無言',
    summary: '지체는 말없이 기회를 앗아간다. 지금 당장 움직이는 사람이 앞선다.',
  },
  {
    phrase: '극기성취',
    subPhrase: '克己成就',
    summary: '자기를 이기는 사람이 결국 목표를 손에 넣는다. 오늘도 자신을 넘는다.',
  },
  {
    phrase: '응축발력',
    subPhrase: '凝縮發力',
    summary: '힘은 분산될수록 약해진다. 모은 힘을 정확한 한 점에 꽂아 넣는다.',
  },
  {
    phrase: '강행일과',
    subPhrase: '强行日課',
    summary: '컨디션보다 일과가 먼저다. 오늘 해야 할 몫을 조용히 끝낸다.',
  },
  {
    phrase: '한계돌파',
    subPhrase: '限界突破',
    summary: '익숙한 선을 넘을 때 새로운 힘이 열린다. 오늘의 기준을 다시 올린다.',
  },
  {
    phrase: '기상철칙',
    subPhrase: '起床鐵則',
    summary: '아침을 제압한 사람이 하루의 리듬을 장악한다. 침대보다 먼저 의지를 세운다.',
  },
  {
    phrase: '근성축적',
    subPhrase: '根性蓄積',
    summary: '근성은 한 번의 폭발이 아니라 매일의 축적으로 만들어진다.',
  },
  {
    phrase: '완급조절',
    subPhrase: '緩急調節',
    summary: '무작정 세게만 가는 것이 아니라 오래 가도록 조절하는 힘도 실력이다.',
  },
  {
    phrase: '묵중수행',
    subPhrase: '默重修行',
    summary: '가볍지 않게, 떠들지 않게, 묵직하게 쌓는다. 오늘도 조용히 단련한다.',
  },
  {
    phrase: '집념축성',
    subPhrase: '執念築成',
    summary: '집념은 하루아침에 성을 올린다. 한 번 더 버틴 시간이 결국 형체가 된다.',
  },
  {
    phrase: '신속결단',
    subPhrase: '迅速決斷',
    summary: '망설이는 시간만큼 힘이 샌다. 빠른 결단으로 흐름을 먼저 잡는다.',
  },
  {
    phrase: '패기정렬',
    subPhrase: '霸氣整列',
    summary: '패기는 흩어지면 소음이 된다. 정렬된 기세만이 상대를 압도한다.',
  },
  {
    phrase: '심지고정',
    subPhrase: '心志固定',
    summary: '흔들리는 마음부터 고정해야 몸도 따라온다. 오늘의 결심을 끝까지 붙든다.',
  },
  {
    phrase: '후퇴금지',
    subPhrase: '後退禁止',
    summary: '오늘 하루만큼은 물러서지 않는다. 작은 후퇴 하나가 큰 습관이 되기 전에 막는다.',
  },
  {
    phrase: '일념관철',
    subPhrase: '一念貫徹',
    summary: '하나의 뜻을 끝까지 관통시킨다. 오늘 정한 목표를 흐리지 않는다.',
  },
  {
    phrase: '전장준비',
    subPhrase: '戰場準備',
    summary: '결전은 갑자기 오지 않는다. 준비된 사람이 새벽을 먼저 차지한다.',
  },
  {
    phrase: '의지점화',
    subPhrase: '意志點火',
    summary: '의지는 기다리면 꺼진다. 스스로 점화하고 바로 행동으로 옮긴다.',
  },
  {
    phrase: '강철호흡',
    subPhrase: '鋼鐵呼吸',
    summary: '무너질 듯한 순간에도 호흡을 고른다. 버티는 리듬이 결국 승부를 만든다.',
  },
] as const;

const ARCHETYPE_LINES: Record<ContentArchetype, string> = {
  knight: '기사처럼 흐트러지지 않은 자세로 오늘의 규율을 지킨다.',
  orc: '오크처럼 거칠더라도 흔들림 없이 밀어붙이는 힘을 유지한다.',
  barbarian: '바바리안처럼 단순하고 강하게, 해야 할 일을 정면으로 돌파한다.',
  elf: '엘프처럼 정밀하고 차갑게, 집중을 잃지 않고 목표를 겨눈다.',
  exile: '추방자처럼 누구도 대신해 주지 않는다는 각오로 스스로를 증명한다.',
};

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function buildKstDate(base = new Date()) {
  return new Date(base.getTime() + KST_OFFSET_MS);
}

export function getKstTodayYmd() {
  const kst = buildKstDate();
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(kst.getUTCDate())}`;
}

export function addDaysToYmd(ymd: string, days: number) {
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function buildScheduledPublishAtIso(contentDate: string) {
  return new Date(`${contentDate}T00:05:00+09:00`).toISOString();
}

export function isContentArchetype(value: string): value is ContentArchetype {
  return ARCHETYPE_ROTATION.includes(value as ContentArchetype);
}

export function isGeneratorProvider(value: string): value is GeneratorProvider {
  return value === 'veo' || value === 'higgsfield';
}

export function isPublishMode(value: string): value is PublishMode {
  return value === 'immediate' || value === 'scheduled';
}

function resolveSeasonForDate(
  contentDate: string,
  seasons: ContentSeasonRow[],
  preferredSeasonId: string | null,
) {
  const monthKey = monthKeyFromDate(contentDate);
  const preferredSeason = preferredSeasonId
    ? seasons.find((season) => season.id === preferredSeasonId) ?? null
    : null;

  if (preferredSeason?.month_key === monthKey) {
    return preferredSeason;
  }

  const matchingSeason = seasons.find((season) => season.month_key === monthKey && season.is_active)
    ?? seasons.find((season) => season.month_key === monthKey)
    ?? preferredSeason
    ?? seasons.find((season) => season.is_active)
    ?? seasons[0]
    ?? null;

  return matchingSeason;
}

function resolveArchetype(contentDate: string, seedArchetype: ContentArchetype | null) {
  const baseOffset = seedArchetype ? ARCHETYPE_ROTATION.indexOf(seedArchetype) : 0;
  const offset = baseOffset < 0 ? 0 : baseOffset;
  const nextIndex = (hashString(`${contentDate}:archetype`) + offset) % ARCHETYPE_ROTATION.length;
  return ARCHETYPE_ROTATION[nextIndex];
}

function resolveTemplate(contentDate: string, season: ContentSeasonRow | null) {
  const seasonSalt = season?.month_key ?? 'default';
  return CONTENT_LIBRARY[hashString(`${contentDate}:${seasonSalt}:phrase`) % CONTENT_LIBRARY.length];
}

function buildDescription(
  template: (typeof CONTENT_LIBRARY)[number],
  archetype: ContentArchetype,
  season: ContentSeasonRow | null,
) {
  const parts = [
    template.summary,
    ARCHETYPE_LINES[archetype],
  ];

  if (season?.season_summary?.trim()) {
    parts.push(`이번 시즌의 결을 유지하며 하루 리듬을 끝까지 붙든다.`);
  }

  return parts.join(' ');
}

function buildGeneratedSocialCaption(params: {
  phrase: string;
  subPhrase: string;
  description: string;
  season: ContentSeasonRow | null;
  archetype: ContentArchetype;
}) {
  const tags = [
    '#맨즈알림',
    '#오늘의문구',
    '#기상미션',
    `#${getArchetypeLabel(params.archetype).replace(/\s+/g, '')}`,
  ];

  if (params.season?.title) {
    tags.push(`#${params.season.title.replace(/\s+/g, '')}`);
  }

  return [
    buildDefaultSocialCaption(params.phrase, params.subPhrase, params.description),
    tags.join(' '),
  ].join('\n\n');
}

export type GeneratedDailyContentDraft = {
  contentDate: string;
  season: ContentSeasonRow | null;
  archetype: ContentArchetype;
  generatorProvider: GeneratorProvider;
  phrase: string;
  subPhrase: string;
  description: string;
  socialCaption: string;
  generationPromptDraft: string;
  generationPromptFinal: string;
  publishMode: PublishMode;
  publishAt: string | null;
};

export function buildUpcomingDrafts(params: {
  startDate: string;
  days: number;
  seasons: ContentSeasonRow[];
  preferredSeasonId: string | null;
  generatorProvider: GeneratorProvider;
  seedArchetype: ContentArchetype | null;
  publishMode: PublishMode;
}) {
  const drafts: GeneratedDailyContentDraft[] = [];

  for (let offset = 0; offset < params.days; offset += 1) {
    const contentDate = addDaysToYmd(params.startDate, offset);
    const season = resolveSeasonForDate(contentDate, params.seasons, params.preferredSeasonId);
    const archetype = resolveArchetype(contentDate, params.seedArchetype);
    const template = resolveTemplate(contentDate, season);
    const description = buildDescription(template, archetype, season);
    const generationPromptDraft = buildPromptDraft({
      season,
      archetype,
      provider: params.generatorProvider,
      phrase: template.phrase,
      subPhrase: template.subPhrase,
      description,
    });

    drafts.push({
      contentDate,
      season,
      archetype,
      generatorProvider: params.generatorProvider,
      phrase: template.phrase,
      subPhrase: template.subPhrase,
      description,
      socialCaption: buildGeneratedSocialCaption({
        phrase: template.phrase,
        subPhrase: template.subPhrase,
        description,
        season,
        archetype,
      }),
      generationPromptDraft,
      generationPromptFinal: generationPromptDraft,
      publishMode: params.publishMode,
      publishAt: params.publishMode === 'scheduled' ? buildScheduledPublishAtIso(contentDate) : null,
    });
  }

  return drafts;
}
