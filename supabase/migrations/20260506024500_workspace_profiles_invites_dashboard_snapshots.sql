alter table public.workspaces
  add column if not exists profile_settings jsonb not null default '{}'::jsonb;

alter table public.app_users
  add column if not exists display_name text,
  add column if not exists profile_settings jsonb not null default '{}'::jsonb;

create table if not exists public.workspace_invites (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  token_hash text not null unique,
  role text not null default 'operator',
  created_by_user_id uuid references public.app_users (id) on delete set null,
  accepted_by_user_id uuid references public.app_users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint workspace_invites_role_check check (
    role in ('owner', 'admin', 'operator', 'viewer')
  )
);

create index if not exists workspace_invites_workspace_id_idx
  on public.workspace_invites (workspace_id);

create index if not exists workspace_invites_expires_at_idx
  on public.workspace_invites (expires_at);

create table if not exists public.dashboard_snapshots (
  workspace_id text not null references public.workspaces (id) on delete cascade,
  period text not null,
  payload jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  primary key (workspace_id, period),
  constraint dashboard_snapshots_period_check check (
    period in ('7d', '30d', '3m', 'current')
  )
);

create index if not exists dashboard_snapshots_workspace_computed_idx
  on public.dashboard_snapshots (workspace_id, computed_at desc);

insert into public.workspaces (
  id,
  name,
  slug,
  status,
  niche,
  default_language,
  channels,
  profile_settings,
  created_at,
  updated_at
)
values (
  'ws_icon',
  'Icon Workspace',
  'icon-workspace',
  'active',
  'general',
  'en',
  '{}'::jsonb,
  '{"companyName":"Icon Workspace"}'::jsonb,
  now(),
  now()
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  status = excluded.status,
  updated_at = now();

alter table public.workspace_invites enable row level security;
alter table public.dashboard_snapshots enable row level security;
