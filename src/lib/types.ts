export type WorkflowStatus =
  | 'draft'
  | 'rendering'
  | 'preview_ready'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed';

export type PublishMode = 'immediate' | 'scheduled';
export type GeneratorProvider = 'veo' | 'higgsfield';
export type AppPublishStatus = 'draft' | 'approved_live' | 'failed';
export type PlatformPublishStatus = 'pending' | 'processing' | 'published' | 'failed';

export type ContentArchetype =
  | 'orc'
  | 'barbarian'
  | 'elf'
  | 'knight'
  | 'exile';

export type ContentEventType =
  | 'content_created'
  | 'content_updated'
  | 'background_uploaded'
  | 'render_requested'
  | 'render_completed'
  | 'render_failed'
  | 'approved'
  | 'scheduled'
  | 'publish_requested'
  | 'publish_completed'
  | 'publish_failed'
  | 'retry_requested';

export type DailyContentRow = {
  id: string;
  content_date: string;
  season_id: string | null;
  archetype: ContentArchetype | null;
  generator_provider: GeneratorProvider | null;
  generation_prompt_draft: string | null;
  generation_prompt_final: string | null;
  phrase: string;
  sub_phrase: string;
  description: string;
  reward_url: string | null;
  social_caption: string;
  background_asset_path: string | null;
  drive_file_id: string | null;
  drive_share_url: string | null;
  app_playback_url: string | null;
  app_publish_status: AppPublishStatus;
  youtube_publish_status: PlatformPublishStatus;
  instagram_publish_status: PlatformPublishStatus;
  youtube_last_error: string | null;
  instagram_last_error: string | null;
  poster_asset_path: string | null;
  shortform_video_url: string | null;
  workflow_status: WorkflowStatus;
  publish_mode: PublishMode;
  publish_at: string | null;
  approved_at: string | null;
  published_at: string | null;
  active_publish_request_id: string | null;
  youtube_video_id: string | null;
  youtube_url: string | null;
  instagram_media_id: string | null;
  instagram_url: string | null;
  last_error: string | null;
  reward_title: string | null;
  reward_artist: string | null;
  reward_video_id: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type MediaAssetRow = {
  id: string;
  daily_content_id: string | null;
  storage_path: string;
  mime_type: string;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
  updated_at: string;
};

export type RenderJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type RenderJobRow = {
  id: string;
  daily_content_id: string;
  status: RenderJobStatus;
  attempts: number;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type PublishPlatform = 'youtube' | 'instagram';

export type PublishJobStatus = 'pending' | 'scheduled' | 'processing' | 'completed' | 'failed';

export type PublishJobRow = {
  id: string;
  daily_content_id: string;
  publish_request_id: string;
  platform: PublishPlatform;
  status: PublishJobStatus;
  scheduled_for: string | null;
  attempts: number;
  remote_id: string | null;
  remote_url: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ContentEventRow = {
  id: string;
  daily_content_id: string;
  event_type: ContentEventType;
  actor_email: string | null;
  detail_json: Record<string, unknown> | null;
  created_at: string;
};

export type ContentSeasonRow = {
  id: string;
  month_key: string;
  title: string;
  theme_family: string;
  season_summary: string;
  base_world_prompt: string;
  visual_rules: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SignupLeadRow = {
  id: string;
  nickname: string;
  email: string;
  provider_preference: string | null;
  accepted_terms_at: string;
  created_at: string;
};

export type ProductCategoryRow = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_visible: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ProductRow = {
  id: string;
  category_id: string;
  title: string;
  brand: string;
  status: 'coming_soon' | 'support_request';
  summary: string;
  image_url: string | null;
  sort_order: number;
  is_visible: boolean;
  created_at?: string;
  updated_at?: string;
};

export type AdminSessionState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'unauthenticated' }
  | { status: 'forbidden'; email: string }
  | { status: 'ready'; email: string };

export type SocialHealthResponse = {
  supabasePublicConfigured: boolean;
  supabaseServiceConfigured: boolean;
  youtubeConfigured: boolean;
  instagramConfigured: boolean;
  workerConfigured: boolean;
  contentGeneratorBackend: 'deterministic' | 'ollama';
  contentGeneratorConfigured: boolean;
  contentGeneratorModel: string;
  contentGeneratorModelCandidates?: string[];
};

export type AppHealthResponse = {
  ok: boolean;
  service: string;
  timestamp: string;
  supabaseConfigured: boolean;
  databaseReachable: boolean;
};
