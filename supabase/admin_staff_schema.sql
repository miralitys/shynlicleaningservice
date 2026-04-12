create table if not exists public.admin_staff (
  id uuid primary key,
  name text not null,
  role text,
  phone text,
  email text,
  address text,
  status text not null check (status in ('active', 'inactive', 'on_leave')),
  notes text,
  calendar_connection jsonb,
  w9_record jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_staff_status_idx
  on public.admin_staff (status);

create index if not exists admin_staff_name_idx
  on public.admin_staff (name);

create index if not exists admin_staff_email_idx
  on public.admin_staff (email);

alter table if exists public.admin_staff
  add column if not exists address text;

alter table if exists public.admin_staff
  add column if not exists calendar_connection jsonb;

alter table if exists public.admin_staff
  add column if not exists w9_record jsonb;

create table if not exists public.admin_staff_assignments (
  entry_id uuid primary key references public.quote_ops_entries (id) on delete cascade,
  staff_ids jsonb not null default '[]'::jsonb,
  schedule_date text,
  schedule_time text,
  status text not null default 'planned' check (status in ('planned', 'confirmed', 'completed', 'issue')),
  notes text,
  calendar_sync jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_staff_assignments_schedule_date_idx
  on public.admin_staff_assignments (schedule_date);

create index if not exists admin_staff_assignments_updated_at_idx
  on public.admin_staff_assignments (updated_at desc);

alter table if exists public.admin_staff_assignments
  add column if not exists calendar_sync jsonb;

alter table public.admin_staff enable row level security;
alter table public.admin_staff_assignments enable row level security;
