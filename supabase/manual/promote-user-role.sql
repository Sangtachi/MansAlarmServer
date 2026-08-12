-- =============================================================================
-- Role 승격 복붙 SQL (Supabase → SQL Editor)
-- YOUR_EMAIL_HERE 를 바꾼 뒤 필요한 블록만 실행
-- role: member | admin | operator | seller
-- =============================================================================

-- 이메일 인증 (필요 시)
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, timezone('utc', now()))
where lower(trim(email)) = lower(trim('YOUR_EMAIL_HERE'));

-- 운영자(전체 관리) admin
insert into public.profiles (id, email, role)
select u.id, coalesce(u.email, ''), 'admin'
from auth.users u
where lower(trim(u.email)) = lower(trim('YOUR_EMAIL_HERE'))
on conflict (id) do update
set role = 'admin', email = excluded.email;

-- 콘텐츠 운영자 operator (admin 대신 쓰려면 위 블록 대신 실행)
-- insert into public.profiles (id, email, role)
-- select u.id, coalesce(u.email, ''), 'operator'
-- from auth.users u
-- where lower(trim(u.email)) = lower(trim('YOUR_EMAIL_HERE'))
-- on conflict (id) do update
-- set role = 'operator', email = excluded.email;

-- 판매자 seller
-- insert into public.profiles (id, email, role)
-- select u.id, coalesce(u.email, ''), 'seller'
-- from auth.users u
-- where lower(trim(u.email)) = lower(trim('YOUR_EMAIL_HERE'))
-- on conflict (id) do update
-- set role = 'seller', email = excluded.email;

select id, email, role, nickname, job_tag, created_at
from public.profiles
where lower(trim(email)) = lower(trim('YOUR_EMAIL_HERE'));
