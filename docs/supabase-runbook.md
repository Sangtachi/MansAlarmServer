# Supabase Runbook

## Goal

This runbook sets up the MansAlarm database, storage, admin bootstrap, and baseline health checks.

## Migration order

Run the SQL in this order:

1. `20260402144500_initial_schema.sql`
2. `20260403093000_daily_content_phrase_reward_fields.sql`
3. `20260403183000_daily_contents_reward_url.sql`
4. `20260409163000_shortform_pipeline.sql`

After migrations, run:

5. `seed.sql`

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
