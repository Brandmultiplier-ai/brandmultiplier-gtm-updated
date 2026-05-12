-- Platform-level role: super_admin can access any workspace; everyone else uses workspace_memberships.

alter table public.app_users
  add column if not exists global_role text not null default 'member'
  constraint app_users_global_role_check check (global_role in ('super_admin', 'member'));

comment on column public.app_users.global_role is
  'super_admin: full workspace list + switch into any workspace as owner-equivalent. member: normal tenancy via workspace_memberships.';
