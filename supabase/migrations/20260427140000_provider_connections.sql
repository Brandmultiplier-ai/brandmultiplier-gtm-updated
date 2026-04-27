-- First-class Unipile / provider connection per workspace (secrets decoupled from channels JSON over time)

create table if not exists public.provider_connections (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  provider text not null default 'unipile',
  unipile_account_id text not null,
  unipile_api_key text,
  unipile_base_url text,
  name text,
  is_default boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists provider_connections_workspace_id_idx
  on public.provider_connections (workspace_id);

create unique index if not exists provider_connections_workspace_account_uidx
  on public.provider_connections (workspace_id, unipile_account_id);

alter table public.provider_connections enable row level security;

-- Backfill from legacy workspace.channels.linkedin JSON
insert into public.provider_connections (
  id,
  workspace_id,
  provider,
  unipile_account_id,
  unipile_api_key,
  unipile_base_url,
  name,
  is_default,
  created_at,
  updated_at
)
select
  'conn_' || substr(md5(w.id || (w.channels->'linkedin'->>'unipileAccountId')::text), 1, 12),
  w.id,
  'unipile',
  (w.channels->'linkedin'->>'unipileAccountId'),
  (w.channels->'linkedin'->>'unipileApiKey'),
  (w.channels->'linkedin'->>'unipileBaseUrl'),
  'Default connection',
  true,
  w.created_at,
  w.updated_at
from public.workspaces w
where
  w.channels is not null
  and w.channels->'linkedin' is not null
  and (w.channels->'linkedin'->>'unipileAccountId') is not null
  and (w.channels->'linkedin'->>'unipileAccountId') <> ''
on conflict (workspace_id, unipile_account_id) do nothing;

alter table public.linkedin_seats
  add column if not exists provider_connection_id text references public.provider_connections (id) on delete set null;

-- Link existing seats to the matching connection (same unipile account) when present
update public.linkedin_seats ls
set provider_connection_id = pc.id
from public.provider_connections pc
where
  pc.workspace_id = ls.workspace_id
  and pc.unipile_account_id = ls.unipile_account_id
  and ls.provider_connection_id is null;
