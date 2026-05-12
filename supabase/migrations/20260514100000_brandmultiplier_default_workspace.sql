-- Primary tenant workspace used for invites and default super-admin membership.

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
  'ws_brandmultiplier',
  'BrandMultiplier',
  'brandmultiplier',
  'active',
  'general',
  'en',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  status = excluded.status,
  updated_at = now();
