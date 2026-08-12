# Supabase Runbook

## Goal

This runbook sets up the MansAlarm database, storage, admin bootstrap, and baseline health checks.

## Migration order

Run the SQL in this order:

1. `20260402144500_initial_schema.sql` (기존 profiles 등 — 문서상, 리포에 없을 수 있음)
2. `20260403093000_daily_content_phrase_reward_fields.sql`
3. `20260403183000_daily_contents_reward_url.sql`
4. `20260409163000_shortform_pipeline.sql`
5. **`20260811140000_profiles_roles_mission_completions.sql`** ← 역할 확장 + 미션 기록 테이블

After migrations, run:

6. `seed.sql`

### 20260811 변경 요약

| 대상 | 방식 | 내용 |
|------|------|------|
| `public.profiles` | **ALTER 기존** | `nickname`, `job_tag`, role=`member\|admin\|operator\|seller` |
| `public.mission_completions` | **NEW 테이블** | 회원 미션 성공 일지 (`user_id` + `mission_date`) |

역할 승격: `supabase/manual/promote-user-role.sql`

- `admin` / `operator` → 서버 콘텐츠 운영
- `seller` → 상품 관리 (`/products`)
- `member` → 모바일 앱 일반 회원 (미션 기록 클라우드 동기화)

## What these migrations create

- `profiles`
- `daily_contents`
- `signup_leads`
- `product_categories`
- `products`
- `media_assets`
- `render_jobs`
- `publish_jobs`
- RLS policies for public read, admin manage, and public signup lead insert
- Storage bucket and policies for `content-media`

## Admin bootstrap

### 1. Create an auth user

In Supabase Dashboard:

- `Authentication`
- `Users`
- `Add user`

### 2. Promote the user to admin

Run:

```sql
update public.profiles
set role = 'admin'
where email = 'YOUR_ADMIN_EMAIL';
```

Verify:

```sql
select id, email, role
from public.profiles
order by created_at desc;
```

## Seed verification

Check that you have:

- at least one `daily_contents` row
- visible product categories
- visible products

Example checks:

```sql
select content_date, phrase, workflow_status, is_published
from public.daily_contents
order by content_date desc;

select name, slug, is_visible
from public.product_categories
order by sort_order asc;

select title, status, is_visible
from public.products
order by sort_order asc;
```

## Storage verification

The `20260409163000_shortform_pipeline.sql` migration creates or updates the `content-media` bucket.

Verify:

- bucket exists
- admin session can upload to it
- anon clients can read public poster/video URLs only when they are referenced by published content

## Health checks

### Admin web

- sign in at `/login`
- open `/content`
- verify the access state is `ready`

### Admin API

With an admin session:

- `GET /api/social/health`

Current expected meaning:

- `supabasePublicConfigured`: anon env is present
- `supabaseServiceConfigured`: service role env is present
- `workerConfigured`: worker URL and secret are present
- `youtubeConfigured`: YouTube connector env is present
- `instagramConfigured`: Instagram connector env is present

## Local CLI helpers

```bash
cd /Users/wh.choi/Desktop/Code/MansAlarmServer
npm run supabase:start
npm run supabase:reset
npm run supabase:push
```

Use Dashboard SQL Editor if you are operating on a hosted Supabase project.
