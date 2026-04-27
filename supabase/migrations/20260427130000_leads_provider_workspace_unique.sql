-- Scope lead provider identity to workspace (agency use case)

alter table public.leads drop constraint if exists leads_provider_id_key;

create unique index if not exists leads_workspace_provider_id_uidx
  on public.leads (workspace_id, provider_id);
