alter table public.signal_candidates
  add column if not exists topic_key text,
  add column if not exists topic_label text,
  add column if not exists signal_kind text,
  add column if not exists signal_payload jsonb not null default '{}'::jsonb;

create index if not exists signal_candidates_workspace_topic_updated_idx
  on public.signal_candidates(workspace_id, topic_key, updated_at desc);

create index if not exists signal_candidates_workspace_kind_updated_idx
  on public.signal_candidates(workspace_id, signal_kind, updated_at desc);
