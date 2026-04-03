/** SQL run in Supabase Dashboard → SQL Editor (postgres role). */
export function buildPromoteAdminSql(email: string): string {
  const trimmed = email.trim();
  const escaped = trimmed.replace(/'/g, "''");
  return `insert into public.profiles (id, email, role)
select u.id, coalesce(u.email, ''), 'admin'
from auth.users u
where lower(trim(u.email)) = lower(trim('${escaped}'))
on conflict (id) do update
set role = 'admin',
    email = excluded.email;

-- 확인
select id, email, role, created_at from public.profiles where lower(trim(email)) = lower(trim('${escaped}'));`;
}
