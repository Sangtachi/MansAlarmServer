# Content Pipeline Runbook

## Purpose

This runbook documents how daily content moves from admin input to mobile app consumption.

## Content fields

Each `daily_contents` row is built around:

- `phrase`: main typing target and primary title
- `sub_phrase`: subtitle or secondary line
- `description`: supporting message
- `reward_url`: reward destination after mission success
- `social_caption`: caption text for social publishing
- `generation_prompt_draft`: auto-generated prompt draft for the selected provider
- `generation_prompt_final`: operator-edited final prompt
- `background_asset_path`: uploaded source video
- `poster_asset_path`: generated poster image
- `shortform_video_url`: rendered shortform output
- `app_playback_url`: app playback source when Drive or server playback is used

## Workflow states

- `draft`
- `rendering`
- `preview_ready`
- `approved`
- `scheduled`
- `publishing`
- `published`
- `failed`

## Operator flow

### 1. Create season once per month

In `/content`:

- save a monthly `content_seasons` row first
- keep one active season per month whenever possible
- if future dates cross into another month, create that month season before bulk generation

### 2. Generate upcoming daily drafts

The admin screen now supports:

- `7일 초안 생성`
- `30일 초안 생성`

These buttons:

- generate missing `daily_contents` rows starting from the selected date
- auto-fill `phrase`, `sub_phrase`, `description`, `social_caption`
- auto-fill `generation_prompt_draft` and `generation_prompt_final`
- default the generated rows to `publish_mode = scheduled`
- default `publish_at` to `content_date 00:05 Asia/Seoul`

Rules:

- existing dates are skipped
- current season selection is used first
- if a matching season exists for another month, that season is used automatically
- generator backend is selected by server env
  - `deterministic`
  - `ollama`
- Ollama generation is executed per date, not as one large multi-day request
- malformed Ollama output gets one repair retry by default
- model candidates can be tried in order through `OLLAMA_MODEL_CANDIDATES`
- if Ollama fails, the server falls back to deterministic generation automatically
- admin UI response and `/api/social/health` expose which backend was actually used

### 3. Review and edit one row only if needed

For each generated row, the operator may:

- edit `phrase`, `sub_phrase`, `description`
- edit `generation_prompt_final`
- change `publish_mode` or `publish_at`
- add `reward_url`
- adjust `social_caption`

### 4. Connect the video asset

Choose one of the current supported paths:

- upload a vertical background video and run `Render preview`
- or register a Google Drive file/share URL and run `Drive 해석`

Current expectation:

- 9:16 source is preferred
- background upload is treated as a template source for the renderer
- Drive is treated as an externally created final asset source

### 5. Approve

The operator now uses one approval action.

Behavior:

- if `publish_mode = scheduled`, `승인 + 예약` moves the row to `scheduled`
- if `publish_mode = immediate`, `승인 + 즉시 공개` moves the row to app-live immediately

Approval requires at least one playable asset:

- `app_playback_url`
- or `shortform_video_url`

### 6. Scheduled publish automation

Scheduled publishing is now handled by the worker loop.

What happens:

- worker polls for `workflow_status = scheduled`
- if `publish_at <= now`, the row is promoted to app-live automatically
- `publish_jobs` for YouTube and Instagram are enqueued automatically
- app publication and social publication states remain separate

### 7. Manual immediate publish override

For rows already approved or scheduled, the operator can still press `즉시 게시`.

This does:

- marks the row app-live immediately
- sets `is_published = true`
- creates `publish_jobs` for YouTube and Instagram

### 8. Retry flow

If render fails:

- inspect `last_error`
- press `렌더 재시도`

If social publishing fails:

- inspect `youtube_last_error` or `instagram_last_error`
- press the platform-specific retry action

## Mobile consumption rules

The mobile app only treats a row as live when:

- `is_published = true`
- `content_date` matches the app's target date

The mobile app uses:

- `phrase` for typing validation
- `sub_phrase` and `description` for display only
- `app_playback_url` first
- `shortform_video_url` as fallback video source
- `poster_asset_path` as visual fallback
- `reward_url` after mission success

## Current implementation status

Implemented now:

- admin UI
- daily draft generation for upcoming days
- swappable generator backend
  - deterministic
  - ollama
- automatic deterministic fallback when Ollama fails
- single-approval operator flow
- render queue creation
- scheduled app publication through worker polling
- publish queue creation
- mobile shortform background support
- repeatable local smoke command: `npm run smoke:pipeline`

Still pending:

- Ollama prompt quality tuning and model selection
- completed YouTube upload connector
- completed Instagram Reels upload connector
- Google Drive playback source against production credentials

## Ollama local setup

로컬에서 진짜 LLM 기반 멘트 생성을 쓰려면:

```bash
ollama serve
ollama pull your_ollama_model_name
```

그리고 `MansAlarmServer/.env.local`:

```env
CONTENT_GENERATOR_BACKEND=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434/api
OLLAMA_MODEL=your_ollama_model_name
OLLAMA_MODEL_CANDIDATES=llama3.1:latest,qwen2.5-coder:7b
OLLAMA_KEEP_ALIVE=10m
OLLAMA_TIMEOUT_MS=90000
OLLAMA_REPAIR_RETRIES=1
```

주의:

- Vercel에서 같은 값을 그대로 쓰면 동작하지 않습니다
- Vercel에서 Ollama를 유지하려면 원격 Ollama 엔드포인트를 넣어야 합니다
- 운영에서 원격 LLM이 준비되지 않았다면 `CONTENT_GENERATOR_BACKEND=deterministic`가 안전한 기본값입니다

## Local smoke test

Run this from `MansAlarmServer` root:

```bash
npm run smoke:pipeline
```

This smoke path does all of the following against the connected Supabase project:

- creates a safe future-date smoke content row
- uploads a generated vertical background clip to `content-media`
- inserts a render job and processes it through the worker render code
- promotes the rendered asset to app-live state
- runs publish jobs with `MANSALARM_MOCK_PUBLISH_SUCCESS=1`

What it verifies:

- background asset upload
- `render_jobs -> preview_ready`
- poster and MP4 output generation
- app publish state update
- scheduled/app-live state handling
- `publish_jobs` processing and event logging

What it does not verify:

- real YouTube upload
- real Instagram upload
- Google Drive playback source against production credentials
