insert into public.content_seasons (
  month_key,
  title,
  theme_family,
  season_summary,
  base_world_prompt,
  visual_rules,
  is_active
)
values (
  '2026-04',
  '2026-04 전장 시즌',
  'dark_fantasy_war',
  '검은 전장과 금속성 질감, 절제된 분노와 승부욕이 흐르는 월간 시즌',
  'Dark fantasy battlefield, brutal but restrained masculine energy, cinematic low-key light, black and muted gold palette.',
  '9:16 vertical composition, full body hero silhouette, smoke, dust, rain, cold steel, torch glow, no embedded typography.',
  true
)
on conflict (month_key) do update set
  title = excluded.title,
  theme_family = excluded.theme_family,
  season_summary = excluded.season_summary,
  base_world_prompt = excluded.base_world_prompt,
  visual_rules = excluded.visual_rules,
  is_active = excluded.is_active;

insert into public.daily_contents (
  content_date,
  season_id,
  archetype,
  generator_provider,
  generation_prompt_draft,
  generation_prompt_final,
  phrase,
  sub_phrase,
  description,
  drive_file_id,
  drive_share_url,
  app_playback_url,
  app_publish_status,
  reward_url,
  social_caption,
  reward_title,
  reward_artist,
  reward_video_id,
  youtube_publish_status,
  instagram_publish_status,
  workflow_status,
  publish_mode,
  published_at,
  is_published
)
values
  (
    '2026-04-02',
    (select id from public.content_seasons where month_key = '2026-04'),
    'knight',
    'veo',
    'Dark fantasy battlefield, knight archetype, cinematic rain and smoke, no typography.',
    'Dark fantasy battlefield, knight archetype, cinematic rain and smoke, no typography.',
    '행증자명',
    '行證自明',
    '행동을 증명해라. 말이 아니라 행동과 결과로 자신을 증명한다.',
    null,
    null,
    null,
    'approved_live',
    'https://www.youtube.com/watch?v=VDvr08sCPOc',
    '행증자명\n行證自明\n행동을 증명해라.',
    null,
    null,
    null,
    'pending',
    'pending',
    'published',
    'immediate',
    timezone('utc', now()),
    true
  ),
  (
    '2026-04-03',
    (select id from public.content_seasons where month_key = '2026-04'),
    'barbarian',
    'higgsfield',
    'Dark fantasy battlefield, barbarian archetype, burning dusk and ash, no typography.',
    'Dark fantasy battlefield, barbarian archetype, burning dusk and ash, no typography.',
    '철심단련',
    '鐵心鍛鍊',
    '강한 몸은 하루아침에 오지 않는다. 반복과 절제가 몸을 만든다.',
    null,
    null,
    null,
    'approved_live',
    'https://www.youtube.com/watch?v=btPJPFnesV4',
    '철심단련\n鐵心鍛鍊\n강한 몸은 하루아침에 오지 않는다.',
    null,
    null,
    null,
    'pending',
    'pending',
    'published',
    'immediate',
    timezone('utc', now()),
    true
  )
on conflict (content_date) do update set
  phrase = excluded.phrase,
  season_id = excluded.season_id,
  archetype = excluded.archetype,
  generator_provider = excluded.generator_provider,
  generation_prompt_draft = excluded.generation_prompt_draft,
  generation_prompt_final = excluded.generation_prompt_final,
  sub_phrase = excluded.sub_phrase,
  description = excluded.description,
  drive_file_id = excluded.drive_file_id,
  drive_share_url = excluded.drive_share_url,
  app_playback_url = excluded.app_playback_url,
  app_publish_status = excluded.app_publish_status,
  reward_url = excluded.reward_url,
  social_caption = excluded.social_caption,
  reward_title = excluded.reward_title,
  reward_artist = excluded.reward_artist,
  reward_video_id = excluded.reward_video_id,
  youtube_publish_status = excluded.youtube_publish_status,
  instagram_publish_status = excluded.instagram_publish_status,
  workflow_status = excluded.workflow_status,
  publish_mode = excluded.publish_mode,
  published_at = excluded.published_at,
  is_published = excluded.is_published;

insert into public.product_categories (name, slug, sort_order, is_visible)
values
  ('남자 향수', 'fragrance', 10, true),
  ('그루밍', 'grooming', 20, true),
  ('운동/회복', 'recovery', 30, true),
  ('라이프웨어', 'lifestyle', 40, true),
  ('OEM 프로젝트', 'oem', 50, true),
  ('후원 요청', 'support', 60, true)
on conflict (slug) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_visible = excluded.is_visible;

insert into public.products (category_id, title, brand, status, summary, image_url, sort_order, is_visible)
select c.id, seeded.title, seeded.brand, seeded.status, seeded.summary, seeded.image_url, seeded.sort_order, seeded.is_visible
from (
  values
    ('fragrance', '새벽 블랙 오 드 퍼퓸', 'MANS ALARM', 'coming_soon', '검은 우드와 스모크가 남는 하드한 남자 향수.', null, 10, true),
    ('fragrance', '6AM 골드 미스트', 'MANS ALARM', 'support_request', '기상 직후 뿌리는 시트러스 메탈릭 라인.', null, 20, true),
    ('grooming', '콜드 스타트 올인원 워시', 'IRON FACE', 'coming_soon', '얼굴, 몸, 두피까지 한 번에 끝내는 강한 워시.', null, 30, true),
    ('recovery', '아이스 리커버리 롤온', 'FIRST REP', 'coming_soon', '운동 후 열감과 붓기를 눌러주는 쿨링 롤온.', null, 40, true),
    ('support', '남자의 상품 1차 펀딩', 'COMMUNITY', 'support_request', '원하는 상품군을 모으고 후원 요청을 받는 단계.', null, 50, true)
) as seeded(category_slug, title, brand, status, summary, image_url, sort_order, is_visible)
join public.product_categories c on c.slug = seeded.category_slug
where not exists (
  select 1
  from public.products p
  where p.title = seeded.title
);
