import {
  ContentArchetype,
  ContentSeasonRow,
  GeneratorProvider,
} from './types';

export const GENERATOR_PROVIDER_LABELS: Record<GeneratorProvider, string> = {
  veo: 'Veo',
  higgsfield: 'Higgsfield',
};

export const ARCHETYPE_OPTIONS: Array<{ value: ContentArchetype; label: string }> = [
  { value: 'orc', label: '오크' },
  { value: 'barbarian', label: '바바리안' },
  { value: 'elf', label: '엘프' },
  { value: 'knight', label: '기사' },
  { value: 'exile', label: '추방자' },
];

const DRIVE_ID_PATTERN = /^[a-zA-Z0-9_-]{20,}$/;

export function getArchetypeLabel(value: ContentArchetype | null | undefined) {
  return ARCHETYPE_OPTIONS.find((option) => option.value === value)?.label ?? '미선택';
}

export function buildPromptDraft(params: {
  season: ContentSeasonRow | null;
  archetype: ContentArchetype | null;
  provider: GeneratorProvider;
  phrase: string;
  subPhrase: string;
  description: string;
}) {
  const archetypeLabel = getArchetypeLabel(params.archetype);
  const providerLabel = GENERATOR_PROVIDER_LABELS[params.provider];
  const headline = params.phrase.trim();
  const subHeadline = params.subPhrase.trim();
  const body = params.description.trim();

  const lines = [
    `${providerLabel}용 9:16 세로 숏폼 배경 영상 생성 프롬프트.`,
    '장르는 다크 판타지 전쟁 세계관.',
    params.season?.title ? `월 시즌: ${params.season.title}` : '월 시즌: 미정',
    params.season?.theme_family ? `테마 패밀리: ${params.season.theme_family}` : '',
    params.season?.season_summary ? `시즌 요약: ${params.season.season_summary}` : '',
    params.season?.base_world_prompt ? `월간 월드 프롬프트: ${params.season.base_world_prompt}` : '',
    params.season?.visual_rules ? `비주얼 규칙: ${params.season.visual_rules}` : '',
    `일일 아키타입: ${archetypeLabel}`,
    `핵심 문구: ${headline}`,
    subHeadline ? `서브 문구: ${subHeadline}` : '',
    `설명 문장: ${body}`,
    '카메라는 인물 정면 또는 후면 풀바디, 천천히 미세한 줌 또는 흔들림 없는 시네마틱 무빙.',
    '배경은 안개, 연기, 먼지, 비, 횃불, 차가운 금속성과 검은 질감을 유지.',
    '텍스트는 후편집 오버레이를 전제로 하므로, 영상 안에 문자를 직접 넣지 않는다.',
    '앱 브랜드 톤은 검정과 금색이므로, 빛은 약한 금빛 하이라이트만 사용한다.',
    '노이즈가 과하지 않고, 숏폼 루프에 어울리게 8~12초 길이의 부드러운 반복 장면으로 만든다.',
  ].filter(Boolean);

  return lines.join('\n');
}

export function extractDriveFileId(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }

  if (DRIVE_ID_PATTERN.test(raw)) {
    return raw;
  }

  const fileMatch = raw.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (fileMatch?.[1]) {
    return fileMatch[1];
  }

  const openMatch = raw.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (openMatch?.[1]) {
    return openMatch[1];
  }

  return null;
}

export function normalizeDriveShareUrl(value: string | null | undefined) {
  const fileId = extractDriveFileId(value);
  if (!fileId) {
    return null;
  }

  return `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
}

export function buildDrivePlaybackSource(fileId: string) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

export function buildAppPlaybackRoute(origin: string, contentId: string) {
  const normalizedOrigin = origin.replace(/\/$/, '');
  return `${normalizedOrigin}/api/content/${contentId}/playback`;
}

export function monthKeyFromDate(date: string) {
  return date.slice(0, 7);
}
