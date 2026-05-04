# Community V1 Spec

## Product direction

Community should extend the app's core behavior, not replace it.

The right v1 is:

- anonymous-feeling
- nickname-centered
- asynchronous
- built around wake-up success, routine proof, and today's phrase

This is closer to a `Blind-style feed for disciplined men` than a general-purpose forum.

## Core concept

After a user completes the alarm mission, the app can prompt:

- `오늘의 문구 인증글 남기기`

That makes community feel like part of the wake-up loop.

## V1 categories

- `오늘의 기상 인증`
- `오늘의 문구 한줄`
- `루틴 / 운동 / 회복`
- `남자의 질문`

## Identity model

- use nickname and masked profile identity
- no real-name requirement
- no public follower system in v1
- streak and wake-up credibility can be shown as lightweight badges later

## Interaction scope

V1 keeps interaction intentionally small:

- feed posts
- reactions only

Recommended reactions:

- `존경`
- `독하다`
- `완료`

Excluded from v1:

- comments
- direct messages
- real-time chat
- voice rooms

## Feed shape

Each post card should be able to show:

- nickname
- category
- short body
- optional wake-up badge or streak hint
- reaction counts
- created time

## Why this fits MansAlarm

- the app already has a strong daily trigger: wake-up success
- the brand is built around self-proof and discipline
- a lightweight proof feed is easier to moderate than a wide-open community
- it keeps the product close to alarm, routine, and male identity instead of drifting into generic social content

## Future Supabase tables

These are not implemented yet, but they are the likely v1 schema direction:

- `community_boards`
- `community_posts`
- `community_reactions`
- `community_reports`

## Status

Implemented now:

- idea direction only
- no community tables
- no mobile community screen

Planned next:

- feed shell in mobile
- board and post schema in Supabase
- reaction-only interaction model
