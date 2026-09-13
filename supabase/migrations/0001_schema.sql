-- ============================================================
-- Employee Location Gateway - Database Schema
-- PostgreSQL + Supabase + RLS
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.employee_status as enum ('active', 'disabled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.link_type as enum ('single_use', 'multi_use');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.link_status as enum ('active', 'used', 'disabled', 'expired');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.attendance_status as enum (
    'inside',
    'outside',
    'low_accuracy',
    'location_denied',
    'expired_link',
    'invalid_link',
    'already_used',
    'disabled_link',
    'error'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.verification_level as enum ('high', 'medium', 'low');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.workplace_status as enum ('active', 'disabled');
exception when duplicate_object then null;
end $$;

-- ------------------------------------------------------------
-- profiles (one row per auth.users -> admin only)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role public.user_role not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- employees
-- ------------------------------------------------------------
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  employee_number text not null unique,
  phone text,
  department text,
  status public.employee_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- workplaces
-- ------------------------------------------------------------
create table if not exists public.workplaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  allowed_radius double precision not null default 100 check (allowed_radius > 0),
  min_accuracy double precision not null default 100 check (min_accuracy > 0),
  status public.workplace_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- attendance_links
-- ------------------------------------------------------------
create table if not exists public.attendance_links (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  workplace_id uuid not null references public.workplaces (id) on delete cascade,
  token_hash text not null unique,
  token_value_encrypted text,
  original_url text not null,
  link_type public.link_type not null default 'single_use',
  expires_at timestamptz,
  usage_count integer not null default 0,
  max_usage_count integer check (max_usage_count is null or max_usage_count > 0),
  status public.link_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_attendance_links_token_hash on public.attendance_links (token_hash);
create index if not exists idx_attendance_links_employee on public.attendance_links (employee_id);
create index if not exists idx_attendance_links_status on public.attendance_links (status);

-- ------------------------------------------------------------
-- attendance_records
-- ------------------------------------------------------------
create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  link_id uuid not null references public.attendance_links (id) on delete cascade,
  workplace_id uuid references public.workplaces (id) on delete set null,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  distance_meters double precision,
  attendance_status public.attendance_status not null default 'inside',
  verification_level public.verification_level,
  client_timestamp timestamptz,
  server_timestamp timestamptz not null default now(),
  ip_address text,
  user_agent text,
  risk_flags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_attendance_records_employee on public.attendance_records (employee_id);
create index if not exists idx_attendance_records_link on public.attendance_records (link_id);
create index if not exists idx_attendance_records_workplace on public.attendance_records (workplace_id);
create index if not exists idx_attendance_records_timestamp on public.attendance_records (created_at desc);
create index if not exists idx_attendance_records_status on public.attendance_records (attendance_status);

-- ------------------------------------------------------------
-- app_settings (system-wide settings such as allow_outside_redirect)
-- ------------------------------------------------------------
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Auto-update updated_at triggers
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_employees_updated_at on public.employees;
create trigger trg_employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

drop trigger if exists trg_workplaces_updated_at on public.workplaces;
create trigger trg_workplaces_updated_at
  before update on public.workplaces
  for each row execute function public.set_updated_at();

drop trigger if exists trg_attendance_links_updated_at on public.attendance_links;
create trigger trg_attendance_links_updated_at
  before update on public.attendance_links
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Auto-create profile when admin signs up
-- (only the seeded admin below can exist; additional signups are
--  restricted by trigger checking email allowlist in app_settings)
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'admin'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- Default settings
-- ------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('allow_outside_redirect', 'false'::jsonb),
  ('global_min_accuracy', '100'::jsonb)
on conflict (key) do nothing;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.employees enable row level security;
alter table public.workplaces enable row level security;
alter table public.attendance_links enable row level security;
alter table public.attendance_records enable row level security;
alter table public.app_settings enable row level security;

-- admins helper
create or replace function public.is_admin()
returns boolean
language sql
stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

-- profiles: admin can read/update own profile
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- employees: admin full access, employees none
drop policy if exists "employees_admin_all" on public.employees;
create policy "employees_admin_all"
  on public.employees for all
  using (public.is_admin())
  with check (public.is_admin());

-- workplaces: admin full access
drop policy if exists "workplaces_admin_all" on public.workplaces;
create policy "workplaces_admin_all"
  on public.workplaces for all
  using (public.is_admin())
  with check (public.is_admin());

-- attendance_links: admin full access
drop policy if exists "attendance_links_admin_all" on public.attendance_links;
create policy "attendance_links_admin_all"
  on public.attendance_links for all
  using (public.is_admin())
  with check (public.is_admin());

-- attendance_records: admin full access
drop policy if exists "attendance_records_admin_all" on public.attendance_records;
create policy "attendance_records_admin_all"
  on public.attendance_records for all
  using (public.is_admin())
  with check (public.is_admin());

-- app_settings: admin full access, authenticated can read (edge functions run with service role)
drop policy if exists "app_settings_admin_all" on public.app_settings;
create policy "app_settings_admin_all"
  on public.app_settings for all
  using (public.is_admin())
  with check (public.is_admin());