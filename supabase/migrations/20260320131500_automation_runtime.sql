create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.job_locks (
  name text primary key,
  token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_locks_expires_at_idx on public.job_locks(expires_at);

alter table public.job_locks enable row level security;

create or replace function public.acquire_job_lock(
  lock_name text,
  lock_ttl_seconds integer,
  owner_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts timestamptz := now();
  ttl_seconds integer := greatest(lock_ttl_seconds, 1);
begin
  update public.job_locks
  set token = owner_token,
      expires_at = now_ts + make_interval(secs => ttl_seconds),
      updated_at = now_ts
  where name = lock_name
    and expires_at <= now_ts;

  if found then
    return true;
  end if;

  begin
    insert into public.job_locks (name, token, expires_at, created_at, updated_at)
    values (
      lock_name,
      owner_token,
      now_ts + make_interval(secs => ttl_seconds),
      now_ts,
      now_ts
    );
    return true;
  exception
    when unique_violation then
      return false;
  end;
end;
$$;

create or replace function public.release_job_lock(
  lock_name text,
  owner_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.job_locks
  where name = lock_name
    and token = owner_token;

  return found;
end;
$$;

create or replace function public.configure_automation_cron(
  job_name text,
  cron_schedule text,
  endpoint_url text,
  cron_secret text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_job_id bigint;
  command text;
  headers_json text;
begin
  select jobid
    into existing_job_id
  from cron.job
  where jobname = configure_automation_cron.job_name
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  headers_json := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || cron_secret
  )::text;

  command := format(
    $job$select net.http_post(
      url := %L,
      headers := %L::jsonb,
      body := %L::jsonb,
      timeout_milliseconds := 10000
    );$job$,
    endpoint_url,
    headers_json,
    '{"source":"supabase_cron"}'
  );

  return cron.schedule(job_name, cron_schedule, command);
end;
$$;

revoke all on function public.acquire_job_lock(text, integer, text) from public, anon, authenticated;
revoke all on function public.release_job_lock(text, text) from public, anon, authenticated;
revoke all on function public.configure_automation_cron(text, text, text, text) from public, anon, authenticated;

grant execute on function public.acquire_job_lock(text, integer, text) to service_role;
grant execute on function public.release_job_lock(text, text) to service_role;
grant execute on function public.configure_automation_cron(text, text, text, text) to service_role;
