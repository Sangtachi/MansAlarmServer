/** 앱/서버 공통 회원 Role */
export type UserRole = 'member' | 'admin' | 'operator' | 'seller';

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  member: '일반 회원',
  admin: '운영자(전체)',
  operator: '콘텐츠 운영',
  seller: '판매자',
};

/** 서버 관리 화면 로그인 가능 (seller는 상품만) */
export function canAccessStaffConsole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'operator' || role === 'seller';
}

/** 콘텐츠/미션 API 등 운영 권한 */
export function canManageContent(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'operator';
}

/** 상품 관리 권한 */
export function canManageProducts(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'operator' || role === 'seller';
}

export function defaultLandingPath(role: string | null | undefined): string {
  if (role === 'seller') return '/products';
  if (role === 'admin' || role === 'operator') return '/content';
  return '/login';
}
