# MansAlarm Environment Matrix

## Principle

- `Supabase` issues the keys
- `MansAlarmServer` uses them for admin web and protected orchestration
- `MansAlarm` mobile uses only the public anon client
- `SUPABASE_SERVICE_ROLE_KEY` must never be shipped inside the mobile app

## Matrix

| Target | Location | Required variables | Optional variables | Notes |
| --- | --- | --- | --- | --- |
| Server local | `MansAlarmServer/.env.local` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `SUPABASE_SERVICE_ROLE_KEY`, `CONTENT_GENERATOR_BACKEND`, `OLLAMA_*`, `RENDER_WORKER_URL`, `RENDER_WORKER_SECRET`, `YOUTUBE_*`, `INSTAGRAM_*` | Used by local Next.js admin web |
| Server deploy | Vercel project env | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `SUPABASE_SERVICE_ROLE_KEY`, `CONTENT_GENERATOR_BACKEND`, `OLLAMA_*`, `RENDER_WORKER_URL`, `RENDER_WORKER_SECRET`, `YOUTUBE_*`, `INSTAGRAM_*` | `OLLAMA_BASE_URL=http://127.0.0.1:11434/api` is invalid on Vercel. Use a reachable remote Ollama endpoint or keep deterministic mode. |
| Worker local | shell env or worker `.env` equivalent | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `CONTENT_MEDIA_BUCKET`, `POLL_INTERVAL_MS`, `FFMPEG_FONT_FILE` | Worker should not rely on anon key |
| Worker deploy | Railway or other worker env | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | same as worker local plus social connector vars | Separate runtime from Vercel |
| Mobile local | `MansAlarm/apps/mobile/.env.local` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | none | Used by Expo/dev build and local Android/iOS runs |
| Mobile release | EAS env or CI secrets | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | none | Same values as mobile local, injected at build time |

## Public variable names

### Server admin web

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
CONTENT_GENERATOR_BACKEND=deterministic
OLLAMA_BASE_URL=http://127.0.0.1:11434/api
OLLAMA_MODEL=
OLLAMA_MODEL_CANDIDATES=
OLLAMA_KEEP_ALIVE=10m
OLLAMA_TIMEOUT_MS=90000
OLLAMA_REPAIR_RETRIES=1
```

### Mobile app

```env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

## Restricted variable names

These must stay in server or worker infrastructure only:

```env
SUPABASE_SERVICE_ROLE_KEY=
RENDER_WORKER_SECRET=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=
YOUTUBE_CHANNEL_ID=
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_BUSINESS_ID=
```

## Content generator backend

- `CONTENT_GENERATOR_BACKEND=deterministic`
  - 규칙 기반 초안 생성기만 사용
- `CONTENT_GENERATOR_BACKEND=ollama`
  - Ollama를 먼저 호출
  - 날짜별 1건씩 생성
  - 실패 시 repair retry 수행
  - `OLLAMA_MODEL_CANDIDATES`가 있으면 모델 후보를 순서대로 시도
  - 실패하면 서버가 자동으로 deterministic fallback으로 내려감

로컬에서 Ollama를 쓸 때 기본값:

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434/api
```

Vercel에서는 `127.0.0.1`를 쓰면 안 됩니다.

- Vercel 함수 안의 `localhost`는 사용자의 맥북 Ollama가 아닙니다
- 배포 환경에서 Ollama를 계속 쓸 거면 네트워크로 접근 가능한 원격 Ollama 인스턴스가 필요합니다
- 그렇지 않으면 Vercel에서는 `CONTENT_GENERATOR_BACKEND=deterministic`로 두는 게 맞습니다

## URL configuration

In Supabase Auth URL Configuration, set:

- `Site URL` to the Vercel URL for `MansAlarmServer`
- `Redirect URLs` to the same Vercel host and any local admin login URLs you use

## Current local recommendation

- Keep `MansAlarmServer/.env.local` for server-only local work
- Keep `MansAlarm/apps/mobile/.env.local` for mobile-only local work
- Do not try to share one env file across both repos
