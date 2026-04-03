-- =============================================================================
-- MansAlarm — 관리자 로그인용 복붙 SQL (Supabase Dashboard → SQL Editor)
-- 아래 YOUR_EMAIL_HERE 를 실제 이메일로 바꾼 뒤, 필요한 블록만 순서대로 실행하세요.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) 전제
-- -----------------------------------------------------------------------------
-- 계정은 Supabase → Authentication → Users → Add user 로 먼저 만듭니다.
-- 가입 시 트리거가 public.profiles 에 기본 role = 'member' 행을 넣습니다.
-- 로그인 검증은 auth.users 이며, "Email not confirmed" 면 1) 부터 실행합니다.


-- -----------------------------------------------------------------------------
-- 1) 이메일 미인증으로 로그인이 막힐 때 (Email not confirmed)
-- -----------------------------------------------------------------------------
-- YOUR_EMAIL_HERE 만 수정

update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, timezone('utc', now()))
where lower(trim(email)) = lower(trim('YOUR_EMAIL_HERE'));


-- -----------------------------------------------------------------------------
-- 2) 관리자 권한 (public.profiles.role = admin)
-- -----------------------------------------------------------------------------
-- YOUR_EMAIL_HERE 만 수정
-- auth.users 에 해당 이메일이 있어야 합니다.

insert into public.profiles (id, email, role)
select u.id, coalesce(u.email, ''), 'admin'
from auth.users u
where lower(trim(u.email)) = lower(trim('YOUR_EMAIL_HERE'))
on conflict (id) do update
set role = 'admin',
    email = excluded.email;


-- -----------------------------------------------------------------------------
-- 3) 확인용 조회 (선택)
-- -----------------------------------------------------------------------------

select id, email, email_confirmed_at, created_at
from auth.users
where lower(trim(email)) = lower(trim('YOUR_EMAIL_HERE'));

select id, email, role, created_at
from public.profiles
where lower(trim(email)) = lower(trim('YOUR_EMAIL_HERE'));
