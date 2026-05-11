# Handoff Checklist

이 문서는 `MansAlarm`과 `MansAlarmServer`를 다른 컴퓨터에서 다시 이어서 개발할 때 보는 기준 문서입니다.

## 1. 지금까지 해낸 것

### 모바일 앱

- 홈 기반 알람 UX
- 홈 위 풀스크린 미션 오버레이
- 문구/숫자/QR/사진 미션
- reward 화면
- 오늘 콘텐츠(`phrase`, `sub_phrase`, `description`, `app_playback_url`) 소비
- 브랜딩 아이콘/스플래시 반영

### 서버

- 관리자 웹
- Supabase 스키마와 RLS
- 오늘 콘텐츠 운영 구조
- 숏폼 렌더 파이프라인
- 시즌/아키타입 구조
- Drive 링크/파일 ID 관리
- 모바일과 연결되는 `app_playback_url` 구조

## 2. 지금 안 된 것

- 멘트 자동 생성
- 실제 YouTube 업로드
- 실제 Instagram 업로드
- 완전 자동 예약 게시

즉 현재는:

- 운영자가 `phrase`, `sub_phrase`, `description`을 직접 입력
- 서버는 `프롬프트 초안`, `영상 처리`, `앱 공개 흐름`을 담당

## 3. 새 컴퓨터에서 필요한 저장소

두 저장소가 모두 필요합니다.

```text
/.../Code/
  MansAlarm/
  MansAlarmServer/
```

## 4. 새 컴퓨터 기본 준비물

- Node.js / npm
- Android Studio
- Java / Android SDK
- Xcode (iOS가 필요하면)
- Supabase 프로젝트 접근 권한
- Vercel 프로젝트 접근 권한

## 5. 서버 먼저 복구

```bash
git clone https://github.com/Sangtachi/MansAlarmServer.git
cd MansAlarmServer
npm install
```

`.env.local`에 아래 값을 넣습니다.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

필요 시 추가:

- `RENDER_WORKER_URL`
- `RENDER_WORKER_SECRET`
- 소셜 업로드용 키들

서버 실행:

```bash
cd /path/to/MansAlarmServer
npm run dev
```

기본 검증:

```bash
cd /path/to/MansAlarmServer
npm run build
npm run lint
```

브라우저 확인:

- `/login`
- `/content`
- `/api/health`

## 6. Supabase 확인

다음이 살아 있어야 합니다.

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
- `content-media` storage bucket

관리자 계정도 필요합니다.

- Supabase Auth 유저 생성
- `profiles.role = 'admin'`

정확한 순서는 아래 문서를 봅니다.

- `/Users/wh.choi/Desktop/Code/MansAlarmServer/docs/supabase-runbook.md`

## 7. 모바일 복구

```bash
git clone https://github.com/Sangtachi/MansAlarm.git
cd MansAlarm/apps/mobile
npm install
```

`.env.local`에 아래 값을 넣습니다.

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Android 개발 실행:

```bash
cd /path/to/MansAlarm/apps/mobile
npm run android
```

기본 검증:

```bash
cd /path/to/MansAlarm/apps/mobile
npm run typecheck
npm run build:android:apk-release
```

## 8. 시스템이 정상인지 보는 순서

### 서버

1. `/api/health`가 `ok: true`
2. `/content`에서 row가 보임
3. 오늘 콘텐츠를 수정할 수 있음

### 모바일

1. 홈 진입
2. 오늘 문구 보임
3. 미션 오버레이가 정상 표시
4. 미션 성공 후 reward 화면 이동

## 9. 숏폼 파이프라인 재검증

로컬에서 전체 파이프라인 smoke:

```bash
cd /path/to/MansAlarmServer
npm run smoke:pipeline
```

이 명령은 아래를 확인합니다.

- 테스트 콘텐츠 row 생성
- 세로 배경 클립 업로드
- 렌더 처리
- poster/mp4 생성
- 앱 공개 상태 반영
- mock publish 처리

주의:

- 이 smoke는 실제 YouTube/Instagram 업로드를 검증하지 않습니다.

## 10. 지금 기준 다음 개발 우선순위

### 1순위

- 멘트 자동 생성기
  - `phrase`
  - `sub_phrase`
  - `description`
  - `social_caption`

### 2순위

- 운영자가 검수/수정 후 승인하는 흐름 고도화

### 3순위

- 실제 YouTube 업로드
- 실제 Instagram 업로드

## 11. 추천 작업 순서

새 컴퓨터에서 다시 시작할 때는 아래 순서가 가장 안전합니다.

1. `MansAlarmServer` 설치
2. 서버 env 복구
3. Supabase 연결 확인
4. 서버 실행 및 `/api/health` 확인
5. `MansAlarm` 설치
6. 모바일 env 복구
7. Android 실행
8. 홈/미션/reward 확인
9. 마지막에 `npm run smoke:pipeline`

## 12. 마지막 메모

현재 시스템은 이미 `MansAlarmServer -> Supabase -> MansAlarm mobile` 구조로 맞춰져 있습니다.

새 컴퓨터에서 중요한 건 새 기능 개발보다 먼저 아래 두 가지를 확인하는 것입니다.

- env가 정확히 들어갔는가
- Supabase 테이블과 storage bucket이 그대로 살아 있는가
