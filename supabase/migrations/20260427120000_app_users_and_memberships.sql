-- App users and workspace membership (product-layer tenancy)

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists app_users_email_lower_uidx on public.app_users (lower(email));

create table if not exists public.workspace_memberships (
  user_id uuid not null references public.app_users (id) on delete cascade,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  role text not null default 'operator',
  created_at timestamptz not null default now(),
  primary key (user_id, workspace_id),
  constraint workspace_memberships_role_check check (
    role in ('owner', 'admin', 'operator', 'viewer')
  )
);

create index if not exists workspace_memberships_workspace_id_idx
  on public.workspace_memberships (workspace_id);

create index if not exists workspace_memberships_user_id_idx
  on public.workspace_memberships (user_id);

alter table public.app_users enable row level security;
alter table public.workspace_memberships enable row level security;
