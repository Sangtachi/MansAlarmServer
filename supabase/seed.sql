insert into public.daily_contents (
  content_date,
  phrase,
  sub_phrase,
  description,
  reward_url,
  reward_title,
  reward_artist,
  reward_video_id,
  is_published
)
values
  (
    '2026-04-02',
    '행증자명',
    '行證自明',
    '행동을 증명해라. 말이 아니라 행동과 결과로 자신을 증명한다.',
    'https://www.youtube.com/watch?v=VDvr08sCPOc',
    null,
    null,
    null,
    true
  ),
  (
    '2026-04-03',
    '철심단련',
    '鐵心鍛鍊',
    '강한 몸은 하루아침에 오지 않는다. 반복과 절제가 몸을 만든다.',
    'https://www.youtube.com/watch?v=btPJPFnesV4',
    null,
    null,
    null,
    true
  )
on conflict (content_date) do update set
  phrase = excluded.phrase,
  sub_phrase = excluded.sub_phrase,
  description = excluded.description,
  reward_url = excluded.reward_url,
  reward_title = excluded.reward_title,
  reward_artist = excluded.reward_artist,
  reward_video_id = excluded.reward_video_id,
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
