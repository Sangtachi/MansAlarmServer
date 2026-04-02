create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create table if not exists public.daily_contents (
  id uuid primary key default gen_random_uuid(),
  content_date date not null unique,
  headline text not null,
  description text not null,
  typing_target text not null,
  is_published boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.signup_leads (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  email text not null,
  provider_preference text,
  accepted_terms_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.product_categories (id) on delete cascade,
  title text not null,
  brand text not null,
  status text not null check (status in ('coming_soon', 'support_request')),
  summary text not null,
  image_url text,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_daily_contents_updated_at on public.daily_contents;
create trigger set_daily_contents_updated_at
before update on public.daily_contents
for each row execute procedure public.set_updated_at();

drop trigger if exists set_product_categories_updated_at on public.product_categories;
create trigger set_product_categories_updated_at
before update on public.product_categories
for each row execute procedure public.set_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.daily_contents enable row level security;
alter table public.signup_leads enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_admin_manage" on public.profiles;
create policy "profiles_admin_manage"
on public.profiles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "daily_contents_public_read" on public.daily_contents;
create policy "daily_contents_public_read"
on public.daily_contents
for select
to anon, authenticated
using (is_published = true);

drop policy if exists "daily_contents_admin_manage" on public.daily_contents;
create policy "daily_contents_admin_manage"
on public.daily_contents
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "signup_leads_public_insert" on public.signup_leads;
create policy "signup_leads_public_insert"
on public.signup_leads
for insert
to anon, authenticated
with check (true);

drop policy if exists "signup_leads_admin_read" on public.signup_leads;
create policy "signup_leads_admin_read"
on public.signup_leads
for select
to authenticated
using (public.is_admin());

drop policy if exists "product_categories_public_read" on public.product_categories;
create policy "product_categories_public_read"
on public.product_categories
for select
to anon, authenticated
using (is_visible = true);

drop policy if exists "product_categories_admin_manage" on public.product_categories;
create policy "product_categories_admin_manage"
on public.product_categories
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "products_public_read" on public.products;
create policy "products_public_read"
on public.products
for select
to anon, authenticated
using (is_visible = true);

drop policy if exists "products_admin_manage" on public.products;
create policy "products_admin_manage"
on public.products
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
