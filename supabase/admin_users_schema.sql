create table if not exists public.admin_users (
  id text primary key,
  staff_id text not null unique,
  email text not null unique,
  phone text not null default '',
  password_hash text not null,
  status text not null default 'active',
  role text not null default 'cleaner',
  is_employee boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_login_at timestamptz,
  email_verification_required boolean not null default false,
  email_verified_at timestamptz,
  invite_email_sent_at timestamptz,
  invite_email_last_error text not null default ''
);

create index if not exists admin_users_status_idx on public.admin_users (status);
create index if not exists admin_users_role_idx on public.admin_users (role);
create index if not exists admin_users_updated_at_idx on public.admin_users (updated_at desc);

alter table if exists public.admin_users
  add column if not exists is_employee boolean not null default true;

create or replace function public.set_admin_users_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists admin_users_set_updated_at on public.admin_users;
create trigger admin_users_set_updated_at
before update on public.admin_users
for each row
execute function public.set_admin_users_updated_at();
