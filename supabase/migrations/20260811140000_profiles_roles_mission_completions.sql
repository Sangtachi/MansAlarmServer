-- =============================================================================
-- MansAlarm — profiles role 확장 + mission_completions (회원 미션 기록)
-- Supabase Dashboard → SQL Editor 에서 실행하세요.
--
-- 기존 DB 변경:
--   ALTER public.profiles  (nickname, job_tag, role 값 확장)
-- 신규 테이블:
--   CREATE public.mission_completions  ← 미션 성공 클라우드 기록용 (필수 신규)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) profiles: 표시 필드 + role (member | admin | operator | seller)
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists nickname text;

alter table public.profiles
  add column if not exists job_tag text;

alter table public.profiles
  alter column role set default 'member';

-- 기존 check 제약이 있으면면 제거하고 재정의
alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('member', 'admin', 'operator', 'seller'));

comment on column public.profiles.role is
  'member=일반회원, admin=운영자(전체), operator=콘텐츠 운영, seller=판매자';

-- -----------------------------------------------------------------------------
-- 2) 신규 시 profiles 동기화 트리거 (없으면 생성, 있으면면 교체)
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, nickname, job_tag)
  values (
    new.id,
    coalesce(new.email, ''),
    'member',
    coalesce(new.raw_user_meta_data->>'nickname', split_part(coalesce(new.email, 'user'), '@', 1)),
    coalesce(new.raw_user_meta_data->>'jobTag', new.raw_user_meta_data->>'job_tag', '🏢 갓생 직장인')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    nickname = coalesce(excluded.nickname, public.profiles.nickname),
    job_tag = coalesce(excluded.job_tag, public.profiles.job_tag);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 3) NEW: mission_completions (회원만 클라우드 동기화)
-- -----------------------------------------------------------------------------

create table if not exists public.mission_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mission_date date not null,
  phrase text not null default '',
  completed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  constraint mission_completions_user_date_unique unique (user_id, mission_date)
);

create index if not exists mission_completions_user_date_idx
  on public.mission_completions (user_id, mission_date desc);

alter table public.mission_completions enable row level security;

drop policy if exists "mission_completions_select_own" on public.mission_completions;
create policy "mission_completions_select_own"
  on public.mission_completions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "mission_completions_insert_own" on public.mission_completions;
create policy "mission_completions_insert_own"
  on public.mission_completions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "mission_completions_update_own" on public.mission_completions;
create policy "mission_completions_update_own"
  on public.mission_completions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "mission_completions_delete_own" on public.mission_completions;
create policy "mission_completions_delete_own"
  on public.mission_completions
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- 운영 스태프 판별 (profiles RLS 재귀 방지)
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'operator')
  );
$$;

drop policy if exists "mission_completions_staff_select" on public.mission_completions;
create policy "mission_completions_staff_select"
  on public.mission_completions
  for select
  to authenticated
  using (public.is_staff());

-- -----------------------------------------------------------------------------
-- 4) profiles RLS: 본인 읽기/수정 + staff 읽기
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- 일반 회원은 본인 role 변경 불가
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "profiles_staff_select" on public.profiles;
create policy "profiles_staff_select"
  on public.profiles for select to authenticated
  using (public.is_staff());
