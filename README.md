# MansAlarmServer

`MansAlarmServer`는 맨즈알림의 운영 저장소입니다.

이 저장소는 아래 역할을 맡습니다.

- Supabase 스키마, RLS, seed, storage 규칙 관리
- Vercel에 배포되는 관리자 웹
- 오늘 콘텐츠 운영
- 숏폼 렌더/게시 파이프라인 관리
- 모바일이 읽는 원본 데이터 관리

전체 구조는 아래와 같습니다.

`MansAlarmServer -> Supabase -> MansAlarm mobile`

## 지금 구현된 범위

### 운영 웹

- `/login` 관리자 로그인
- `/content` 오늘 콘텐츠/숏폼 운영 콘솔
- `/members` 회원가입 리드 조회
- `/products` 상품/카테고리 관리

### Supabase 데이터

- `daily_contents`
- `content_seasons`
- `media_assets`
- `render_jobs`
- `publish_jobs`
- `content_events`
- `signup_leads`
- `product_categories`
- `products`
- `profiles`

### 숏폼 파이프라인

- 콘텐츠 행 생성
- 시즌/아키타입 선택
- 멘트 초안 생성
- Veo/Higgsfield 프롬프트 초안 생성
- Drive 링크/파일 ID 등록
- 렌더 잡 생성
- poster/mp4 생성
- 앱 공개 상태 반영
- 모바일 `app_playback_url` 소비 구조 연결

## 지금 구현된 자동화

- `7일 초안 생성`, `30일 초안 생성`
- 멘트 생성 백엔드 전환
  - `deterministic`
  - `ollama`
- Ollama 실패 시 deterministic fallback
- 운영자 승인 전 검수/수정 흐름
- worker 기반 예약 게시 자동화

즉 지금은 `운영자가 초안을 생성하고 승인/수정한다`는 흐름까지 올라와 있습니다.

## 아직 안 끝난 것

- Ollama 프롬프트 품질 튜닝
- 실제 YouTube 업로드 커넥터
- 실제 Instagram 업로드 커넥터
- 소셜 업로드까지 포함한 완전 자동 운영 검증

## 빠른 실행

```bash
cd MansAlarmServer
npm install
npm run dev
```

검증용 명령:

```bash
cd MansAlarmServer
npm run build
npm run lint
npm run smoke:pipeline
```

워커:

```bash
cd MansAlarmServer
npm run worker:start
```

Ollama를 로컬에서 붙일 때:

```bash
ollama serve
ollama pull your_ollama_model_name
```

그리고 `.env.local`에 아래를 넣습니다.

```env
CONTENT_GENERATOR_BACKEND=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434/api
OLLAMA_MODEL=your_ollama_model_name
```

## 필수 환경 변수

로컬/배포에서 최소한 아래 값들이 필요합니다.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

멘트 자동 생성 백엔드를 Ollama로 쓸 때는 아래도 추가합니다.

- `CONTENT_GENERATOR_BACKEND`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `OLLAMA_KEEP_ALIVE`
- `OLLAMA_TIMEOUT_MS`

중요:

- `CONTENT_GENERATOR_BACKEND=deterministic`면 기존 규칙 기반 생성기로 동작합니다.
- `CONTENT_GENERATOR_BACKEND=ollama`면 Ollama를 먼저 시도하고, 실패하면 자동으로 deterministic fallback으로 내려갑니다.
- Ollama는 날짜별로 1건씩 생성하고, 실패 시 repair retry를 먼저 수행합니다.
- `OLLAMA_MODEL_CANDIDATES`를 넣으면 첫 모델 실패 시 다음 모델을 순서대로 시도합니다.
- `OLLAMA_BASE_URL=http://127.0.0.1:11434/api`는 로컬 개발에서만 유효합니다.
- Vercel에서 Ollama를 쓰려면 `localhost`가 아니라 접근 가능한 원격 Ollama 엔드포인트를 넣어야 합니다.

상세 매트릭스는 아래 문서를 봅니다.

- `./docs/environment-matrix.md`

## 배포 원칙

- 이 저장소는 Vercel에 배포합니다.
- 모바일 앱은 Vercel과 별도입니다.
- Supabase가 시스템의 source of truth입니다.
- 모바일은 공개 데이터 읽기와 제한된 쓰기만 합니다.

## 문서

- 아키텍처: `./docs/architecture-overview.md`
- Supabase 실행 순서: `./docs/supabase-runbook.md`
- 콘텐츠 운영 순서: `./docs/content-pipeline-runbook.md`
- 새 컴퓨터 이전 체크리스트: `./docs/handoff-checklist.md`

## 지금 가장 먼저 봐야 할 문서

컴퓨터를 바꾸거나 개발을 다시 이어야 하면 아래 문서부터 보면 됩니다.

- `./docs/handoff-checklist.md`
