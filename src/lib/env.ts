function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value?.trim() ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCsv(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const requestedContentGeneratorBackend = process.env.CONTENT_GENERATOR_BACKEND?.trim().toLowerCase() || 'deterministic';
const contentGeneratorBackend = requestedContentGeneratorBackend === 'ollama' ? 'ollama' : 'deterministic';

export const adminEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '',
  youtubeClientId: process.env.YOUTUBE_CLIENT_ID?.trim() || '',
  youtubeClientSecret: process.env.YOUTUBE_CLIENT_SECRET?.trim() || '',
  youtubeRefreshToken: process.env.YOUTUBE_REFRESH_TOKEN?.trim() || '',
  youtubeChannelId: process.env.YOUTUBE_CHANNEL_ID?.trim() || '',
  instagramAppId: process.env.INSTAGRAM_APP_ID?.trim() || '',
  instagramAppSecret: process.env.INSTAGRAM_APP_SECRET?.trim() || '',
  instagramAccessToken: process.env.INSTAGRAM_ACCESS_TOKEN?.trim() || '',
  instagramBusinessId: process.env.INSTAGRAM_BUSINESS_ID?.trim() || '',
  renderWorkerUrl: process.env.RENDER_WORKER_URL?.trim() || '',
  renderWorkerSecret: process.env.RENDER_WORKER_SECRET?.trim() || '',
  contentGeneratorBackend,
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434/api',
  ollamaModel: process.env.OLLAMA_MODEL?.trim() || '',
  ollamaModelCandidates: parseCsv(process.env.OLLAMA_MODEL_CANDIDATES),
  ollamaKeepAlive: process.env.OLLAMA_KEEP_ALIVE?.trim() || '10m',
  ollamaTimeoutMs: parsePositiveInt(process.env.OLLAMA_TIMEOUT_MS, 90000),
  ollamaRepairRetries: parsePositiveInt(process.env.OLLAMA_REPAIR_RETRIES, 1),
  ollamaEnabled: contentGeneratorBackend === 'ollama',
};

export function hasSupabaseEnv() {
  return Boolean(adminEnv.supabaseUrl && adminEnv.supabaseAnonKey);
}

export function hasSupabaseServiceEnv() {
  return Boolean(adminEnv.supabaseUrl && adminEnv.supabaseServiceRoleKey);
}

export function hasOllamaGeneratorEnv() {
  return Boolean(adminEnv.ollamaEnabled && adminEnv.ollamaBaseUrl && adminEnv.ollamaModel);
}
