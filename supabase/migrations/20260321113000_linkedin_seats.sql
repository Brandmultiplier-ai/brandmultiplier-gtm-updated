create table if not exists public.linkedin_seats (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  name text not null,
  status text not null,
  country text not null default '',
  unipile_account_id text not null,
  is_default boolean not null default false,
  quotas jsonb not null default '{}'::jsonb,
  schedule jsonb not null default '{}'::jsonb,
  usage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists linkedin_seats_workspace_id_idx on public.linkedin_seats(workspace_id);
create unique index if not exists linkedin_seats_workspace_default_idx
  on public.linkedin_seats(workspace_id)
  where is_default = true;

alter table public.campaigns
  add column if not exists linkedin_seat_id text references public.linkedin_seats(id) on delete set null;

create index if not exists campaigns_linkedin_seat_id_idx on public.campaigns(linkedin_seat_id);

alter table public.linkedin_seats enable row level security;
