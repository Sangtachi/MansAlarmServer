alter table public.daily_contents
  add column if not exists reward_url text;

-- Backfill from legacy fields
update public.daily_contents
set
  reward_url = case
    when reward_url is not null and btrim(reward_url) <> '' then reward_url
    when reward_video_id is null or btrim(reward_video_id) = '' then reward_url
    when reward_video_id ~* '^https?://' then btrim(reward_video_id)
    else 'https://www.youtube.com/watch?v=' || btrim(reward_video_id)
  end
where reward_url is null or btrim(reward_url) = '';
