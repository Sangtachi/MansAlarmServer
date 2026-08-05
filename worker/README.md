# MansAlarm Worker

This worker processes:

- `render_jobs` for shortform preview rendering
- `publish_jobs` for YouTube + Instagram uploads

## Expected environment variables

### Core

- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `CONTENT_MEDIA_BUCKET` (optional, defaults to `content-media`)
- `POLL_INTERVAL_MS` (optional)
- `FFMPEG_FONT_FILE` (optional)

### Social publish (required for real uploads)

These must be set on the **worker** process (admin/Vercel health chips alone are not enough).

YouTube:

- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `YOUTUBE_REFRESH_TOKEN`
- `YOUTUBE_CHANNEL_ID`

Instagram:

- `INSTAGRAM_APP_ID`
- `INSTAGRAM_APP_SECRET`
- `INSTAGRAM_ACCESS_TOKEN`
- `INSTAGRAM_BUSINESS_ID` (Instagram professional account IG user id)

### Local mock

- `MANSALARM_MOCK_PUBLISH_SUCCESS=1` — skip real APIs and mark publish jobs completed (used by `npm run smoke:pipeline`)

## Current scope

- Render pipeline: `ffmpeg` burn-in text overlays → poster/mp4 on Supabase Storage
- Social publish connectors:
  - YouTube Data API v3 resumable upload (`videos.insert`, public)
  - Instagram Graph API Reels (`media` → poll → `media_publish`)
- Video source for social upload: `shortform_video_url` first, then `app_playback_url`
- Drive-only rows without a public http(s) URL fail with an explicit error
- Missing credentials fail the platform job with a clear message (no silent success)

## Run

```bash
cd MansAlarmServer/worker
npm install
npm start
```

Copy the social env vars into the worker environment (same values as admin `.env.local` / Vercel if you use both).

## Real upload checklist

1. Content has a public video URL (`shortform_video_url` preferred)
2. Worker has YouTube / Instagram env filled
3. `MANSALARM_MOCK_PUBLISH_SUCCESS` is **not** set
4. Approve + publish (or scheduled publish) so `publish_jobs` are enqueued
5. Worker picks up jobs and updates `youtube_*` / `instagram_*` fields on `daily_contents`
