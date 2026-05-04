# MansAlarm Worker

This worker processes:

- `render_jobs` for shortform preview rendering
- `publish_jobs` for social publishing handoff

## Expected environment variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CONTENT_MEDIA_BUCKET` (optional, defaults to `content-media`)
- `POLL_INTERVAL_MS` (optional)
- `FFMPEG_FONT_FILE` (optional)

Social publishing health is controlled by the same envs exposed in the admin app.

## Current scope

- Render pipeline is implemented with `ffmpeg` burn-in text overlays.
- Social publish connectors are scaffolded. Without verified provider credentials they fail with explicit job errors instead of silently succeeding.
