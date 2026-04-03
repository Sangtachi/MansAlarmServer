# 모바일 앱 — 일일 문구(`daily_contents`) 연동 프롬프트

백엔드(MansAlarmServer)에서 아래 스키마·정책이 반영되었을 때, 모바일에서 구현·점검할 항목입니다.

## 데이터 소스

- 테이블: `public.daily_contents`
- Supabase **anon** 클라이언트로 읽을 때, RLS 때문에 **`is_published = true` 인 행만** `select` 가능합니다. (관리자 저장 시 항상 `true`)

## 조회 키

- **`content_date`**: `date`, 예 `'2026-04-04'`. 앱에서 “오늘의 문구”를 쓸 때는 **앱이 사용하는 캘린더 기준 오늘**을 `YYYY-MM-DD` 로 넣어 필터링하세요.
- 같은 날짜에 행이 없으면 빈 결과가 나옵니다.

예시 (의사 코드):

```text
.from('daily_contents')
.select('content_date, phrase, sub_phrase, description, reward_url')
.eq('content_date', todayYmd)
.eq('is_published', true)
.maybeSingle()
```

## 보상 링크 (`reward_url`)

- 컬럼: **`reward_url`** (nullable, 전체 URL 문자열, `http://` 또는 `https://`)
- 사용자가 당일 문구 챌린지(타이핑 등)에 **성공**한 뒤, `reward_url` 이 비어 있지 않으면 **외부 브라우저 또는 인앱 WebView**로 해당 URL을 열면 됩니다.
- 예: `Linking.openURL(url)` (React Native), `url_launcher` (Flutter).

**레거시**: 일부 행에는 예전 컬럼 `reward_video_id` 등만 있을 수 있습니다. 가능하면 서버 마이그레이션으로 `reward_url`이 채워지며, 모바일은 **우선 `reward_url`만 사용**하고 없을 때만 필요 시 예전 필드로 보완(선택).

## 운영 측 동작(참고)

- 관리자 웹에서 **신규 등록 날짜 기본값은 “내일(로컬)”** 이고, 오늘·과거 날짜는 신규로 선택할 수 없습니다. 테스트 시 **기기 날짜** 또는 **특정 `content_date`로 직접 조회**해 검증하세요.

## 체크리스트

1. 당일 `content_date` + `is_published = true` 인 한 건을 가져온다.
2. `phrase` / `sub_phrase` / `description` 을 UI에 맞게 표시한다.
3. 성공 플로우 후 `reward_url` 이 있으면 앱 정책에 맞게 링크를 연다.
4. 네트워크·RLS 오류 시 사용자 메시지 처리.

이 문서는 백엔드 저장소의 `docs/mobile-daily-content-prompt.md`에 두고, 모바일 레포 AI/개발자에게 그대로 붙여 넣어 사용할 수 있습니다.
