do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_contents'
      and column_name = 'headline'
  ) then
    alter table public.daily_contents rename column headline to phrase;
  end if;
end
$$;

alter table public.daily_contents
  add column if not exists sub_phrase text default '';

alter table public.daily_contents
  add column if not exists reward_title text;

alter table public.daily_contents
  add column if not exists reward_artist text;

alter table public.daily_contents
  add column if not exists reward_video_id text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_contents'
      and column_name = 'typing_target'
  ) then
    execute $sql$
      update public.daily_contents
      set
        phrase = coalesce(nullif(trim(phrase), ''), typing_target, '행증자명'),
        sub_phrase = coalesce(sub_phrase, ''),
        reward_title = coalesce(reward_title, ''),
        reward_artist = coalesce(reward_artist, ''),
        reward_video_id = coalesce(reward_video_id, '')
      where true
    $sql$;
  else
    update public.daily_contents
    set
      phrase = coalesce(nullif(trim(phrase), ''), '행증자명'),
      sub_phrase = coalesce(sub_phrase, ''),
      reward_title = coalesce(reward_title, ''),
      reward_artist = coalesce(reward_artist, ''),
      reward_video_id = coalesce(reward_video_id, '')
    where true;
  end if;
end
$$;

alter table public.daily_contents
  alter column phrase set not null;

alter table public.daily_contents
  alter column sub_phrase set default '';

update public.daily_contents
set sub_phrase = ''
where sub_phrase is null;

alter table public.daily_contents
  alter column sub_phrase set not null;

alter table public.daily_contents
  drop column if exists typing_target;
