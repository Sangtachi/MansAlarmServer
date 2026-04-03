export type DailyContentRow = {
  id: string;
  content_date: string;
  phrase: string;
  sub_phrase: string;
  description: string;
  /** Open this URL after the user succeeds (mobile). */
  reward_url: string | null;
  /** Legacy; admin saves clear these. */
  reward_title: string | null;
  reward_artist: string | null;
  reward_video_id: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type SignupLeadRow = {
  id: string;
  nickname: string;
  email: string;
  provider_preference: string | null;
  accepted_terms_at: string;
  created_at: string;
};

export type ProductCategoryRow = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_visible: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ProductRow = {
  id: string;
  category_id: string;
  title: string;
  brand: string;
  status: 'coming_soon' | 'support_request';
  summary: string;
  image_url: string | null;
  sort_order: number;
  is_visible: boolean;
  created_at?: string;
  updated_at?: string;
};

export type AdminSessionState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'unauthenticated' }
  | { status: 'forbidden'; email: string }
  | { status: 'ready'; email: string };
