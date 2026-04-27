create or replace function public.configure_automation_cron(
  job_name text,
  cron_schedule text,
  endpoint_url text,
  cron_secret text,
  request_timeout_ms integer default 300000
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
  effective_timeout_ms integer := greatest(coalesce(request_timeout_ms, 300000), 10000);
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
      timeout_milliseconds := %s
    );$job$,
    endpoint_url,
    headers_json,
    '{"source":"supabase_cron"}',
    effective_timeout_ms
  );

  return cron.schedule(job_name, cron_schedule, command);
end;
$$;

revoke all on function public.configure_automation_cron(text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.configure_automation_cron(text, text, text, text, integer) to service_role;
