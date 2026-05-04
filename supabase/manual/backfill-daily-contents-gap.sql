-- One-off backfill for missing `daily_contents` rows (e.g. a gap like 2026-05-04).
-- Does NOT overwrite: only inserts when `content_date` is absent.
--
-- 1. Edit `missing_dates` below.
-- 2. Run in Supabase SQL editor (or psql) with a role that can insert into `public.daily_contents`.
-- 3. Adjust `season_id` subquery if you need a specific season instead of the active month.

with missing_dates as (
  select unnest(array['2026-05-04']::text[]) as content_date
),
season_pick as (
  select cs.id as season_id
  from public.content_seasons cs
  where cs.is_active = true
  order by cs.month_key desc
  limit 1
)
insert into public.daily_contents (
  content_date,
  season_id,
  archetype,
  generator_provider,
  phrase,
  sub_phrase,
  description,
  generation_prompt_draft,
  generation_prompt_final,
  drive_file_id,
  drive_share_url,
  app_playback_url,
  app_publish_status,
  reward_url,
  reward_title,
  reward_artist,
  reward_video_id,
  social_caption,
  publish_mode,
  publish_at,
  workflow_status,
  is_published,
  youtube_publish_status,
  instagram_publish_status,
  youtube_last_error,
  instagram_last_error,
  shortform_video_url,
  poster_asset_path,
  background_asset_path,
  active_publish_request_id,
  approved_at,
  published_at,
  youtube_video_id,
  youtube_url,
  instagram_media_id,
  instagram_url,
  last_error
)
select
  md.content_date,
  sp.season_id,
  'knight',
  'veo',
  '행증자명',
  '行證自明',
  '백필용 초안 행입니다. 관리자 화면에서 문구·에셋을 교체하세요.',
  'Dark fantasy battlefield, knight archetype, backfill placeholder, no typography.',
  'Dark fantasy battlefield, knight archetype, backfill placeholder, no typography.',
  null,
  null,
  null,
  'draft',
  null,
  null,
  null,
  null,
  '백필 초안',
  'scheduled',
  (md.content_date || 'T00:05:00+09:00')::timestamptz,
  'draft',
  false,
  'pending',
  'pending',
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null
from missing_dates md
cross join season_pick sp
where not exists (
  select 1
  from public.daily_contents d
  where d.content_date = md.content_date
);
