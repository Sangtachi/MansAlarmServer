# MansAlarmServer

`MansAlarmServer` is the operations repo for MansAlarm.

## Responsibilities

- Supabase schema, RLS policies, and seed data
- Admin web for daily content, signup leads, and products
- Optional Vercel serverless APIs for protected admin-only flows

## Structure

```text
MansAlarmServer/
  apps/
    admin-web/
  supabase/
    migrations/
    seed.sql
    config.toml
```

## Local setup

1. Create a Supabase project.
2. Copy `apps/admin-web/.env.example` to `apps/admin-web/.env.local`.
3. Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Run the admin app:

```bash
cd /Users/wh.choi/Desktop/Code/MansAlarmServer
npm run dev:admin
```

5. To use the local Supabase stack:

```bash
cd /Users/wh.choi/Desktop/Code/MansAlarmServer
npm run supabase:start
npm run supabase:reset
```

## Deployment

- Deploy `apps/admin-web` to Vercel.
- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel.
- Point Vercel's project root to `apps/admin-web`.

## Admin bootstrap

1. Create an auth user in Supabase Auth.
2. Update that user's `profiles.role` to `admin`.
3. Sign in to `/login`.
