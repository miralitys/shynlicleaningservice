create table if not exists public.admin_mail_integrations (
  id text primary key,
  provider text not null,
  status text not null default 'connected',
  account_email text not null default '',
  scope text not null default '',
  token_cipher jsonb not null,
  token_expires_at timestamptz,
  connected_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_error text not null default ''
);

create index if not exists admin_mail_integrations_provider_idx
  on public.admin_mail_integrations (provider);

create index if not exists admin_mail_integrations_updated_at_idx
  on public.admin_mail_integrations (updated_at desc);

create or replace function public.set_admin_mail_integrations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists admin_mail_integrations_set_updated_at on public.admin_mail_integrations;
create trigger admin_mail_integrations_set_updated_at
before update on public.admin_mail_integrations
for each row
execute function public.set_admin_mail_integrations_updated_at();
