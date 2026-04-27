create table if not exists public.signal_candidates (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  agent_id text not null references public.agents(id) on delete cascade,
  campaign_id text references public.campaigns(id) on delete set null,
  lead_id text references public.leads(id) on delete set null,
  provider_id text not null,
  name text not null,
  headline text not null default '',
  location text not null default '',
  public_identifier text not null default '',
  network_distance text not null default '',
  signal_source text not null,
  signal_context text not null default '',
  source_post_id text,
  language text not null default 'en',
  icp_fit numeric not null default 0,
  intent_score integer not null default 0,
  total_score numeric not null default 0,
  score_reasoning text not null default '',
  status text not null default 'new',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists signal_candidates_workspace_updated_idx
  on public.signal_candidates(workspace_id, updated_at desc);
create index if not exists signal_candidates_agent_updated_idx
  on public.signal_candidates(agent_id, updated_at desc);
create index if not exists signal_candidates_campaign_updated_idx
  on public.signal_candidates(campaign_id, updated_at desc);
create unique index if not exists signal_candidates_agent_provider_idx
  on public.signal_candidates(agent_id, provider_id);

alter table public.signal_candidates enable row level security;
