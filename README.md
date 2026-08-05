# MansAlarm Server & Admin

이 저장소는 **맨즈알림(MansAlarm)**의 백엔드 인프라 및 운영 관리자 웹 프로젝트입니다. Next.js를 기반으로 하며, 모바일 앱에 필요한 모든 동기부여 콘텐츠와 숏폼 데이터를 생성, 관리, 배포하는 허브 역할을 합니다.

## 🚀 프로젝트 아키텍처

- **Core**: Next.js (App Router) + TypeScript
- **Database**: Supabase (PostgreSQL)
- **AI Backend**: Ollama (for content generation)
- **Storage**: Supabase Storage (Content Media Bucket)
- **Deployment**: Vercel

## 🔑 핵심 기능 (AI 개발 가이드)

### 1. 콘텐츠 파이프라인 (Content Pipeline)
- **자동 초안 생성**: Ollama AI를 이용해 날짜별 명언(`phrase`), 서브 문구, 설명을 자동으로 생성합니다. AI 실패 시 규칙 기반(`deterministic`) 로직으로 대체됩니다.
- **숏폼 연동**: 생성된 문구에 맞춰 Veo/Higgsfield 프롬프트를 생성하고, 구글 드라이브나 업로드된 배경 영상과 매칭합니다.
- **배포 제어**: `is_published` 플래그를 통해 모바일 앱 노출 여부를 결정합니다.

### 2. 관리자 콘솔 (/content)
- **상태 추적**: 초안(Draft) -> 렌더링(Rendering) -> 승인(Approved) -> 게시(Published)의 전 과정을 모니터링합니다.
- **예약 게시**: `publish_at` 설정 및 Worker 프로세스를 통해 정해진 시간에 유튜브/인스타그램/앱에 자동 배포합니다.

### 3. 모바일 데이터 공급
- `daily_contents` 테이블이 Source of Truth입니다.
- 모바일 앱은 매일 `content_date`와 `is_published=true` 조건을 충족하는 단일 행을 가져가 소비합니다.

## 🛠 실행 및 로컬 환경

### 필수 환경 변수 (.env.local)
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CONTENT_GENERATOR_BACKEND=ollama  # 또는 deterministic
```

### 개발 서버 실행
```bash
npm install
npm run dev
```

### 워커(예약 배포용) 실행
```bash
npm run worker:start
```

## 📂 주요 DB 스키마 (Supabase)
- `daily_contents`: 알람 문구, 영상 URL, 리워드 링크 정보
- `content_seasons`: 월간 테마 및 비주얼 가이드
- `products`: 맨즈 스토어 판매 상품 (디지털/실물 구분)
- `community_posts`: 맨즈 클럽 유저 인증 게시글

## 📝 AI 작업 시 주의사항
1. **데이터 정합성**: 모바일 앱에서 특정 날짜의 콘텐츠가 안 나온다면 `is_published` 상태와 `content_date` 형식을 먼저 확인하세요.
2. **리워드 URL**: 유튜브 링크 분석 로직이 모바일/서버 양쪽에 존재합니다. URL 형식이 변경될 경우 `extractYouTubeVideoId` 정규식을 양쪽 다 업데이트해야 합니다.
3. **RLS 규칙**: 유저는 콘텐츠를 읽기만 가능하고, 쓰기는 `service_role` 또는 관리자 세션에서만 가능하도록 Supabase RLS 정책을 준수하세요.
