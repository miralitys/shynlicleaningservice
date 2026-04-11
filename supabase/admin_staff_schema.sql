create table if not exists public.admin_staff (
  id uuid primary key,
  name text not null,
  role text,
  phone text,
  email text,
  status text not null check (status in ('active', 'inactive', 'on_leave')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_staff_status_idx
  on public.admin_staff (status);

create index if not exists admin_staff_name_idx
  on public.admin_staff (name);

create index if not exists admin_staff_email_idx
  on public.admin_staff (email);

create table if not exists public.admin_staff_assignments (
  entry_id uuid primary key references public.quote_ops_entries (id) on delete cascade,
  staff_ids jsonb not null default '[]'::jsonb,
  schedule_date text,
  schedule_time text,
  status text not null default 'planned' check (status in ('planned', 'confirmed', 'completed', 'issue')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_staff_assignments_schedule_date_idx
  on public.admin_staff_assignments (schedule_date);

create index if not exists admin_staff_assignments_updated_at_idx
  on public.admin_staff_assignments (updated_at desc);

alter table public.admin_staff enable row level security;
alter table public.admin_staff_assignments enable row level security;
