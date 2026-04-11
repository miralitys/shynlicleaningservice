create table if not exists public.quote_ops_entries (
  id uuid primary key,
  kind text not null default 'quote_submission',
  status text not null check (status in ('success', 'warning', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  request_id text,
  source_route text,
  source text,
  customer_name text,
  customer_phone text,
  customer_email text,
  service_type text,
  service_name text,
  total_price numeric(12, 2) not null default 0,
  total_price_cents integer not null default 0,
  selected_date text,
  selected_time text,
  full_address text,
  http_status integer,
  code text,
  retryable boolean not null default false,
  warnings jsonb not null default '[]'::jsonb,
  error_message text,
  contact_id text,
  note_created boolean not null default false,
  opportunity_created boolean not null default false,
  custom_fields_updated boolean not null default false,
  used_existing_contact boolean not null default false,
  retry_count integer not null default 0,
  last_retry_at timestamptz,
  last_retry_status text,
  last_retry_message text,
  retry_history jsonb not null default '[]'::jsonb,
  payload_for_retry jsonb
);

create index if not exists quote_ops_entries_created_at_idx
  on public.quote_ops_entries (created_at desc);

create index if not exists quote_ops_entries_status_idx
  on public.quote_ops_entries (status);

create index if not exists quote_ops_entries_service_type_idx
  on public.quote_ops_entries (service_type);

create index if not exists quote_ops_entries_request_id_idx
  on public.quote_ops_entries (request_id);

alter table public.quote_ops_entries enable row level security;
