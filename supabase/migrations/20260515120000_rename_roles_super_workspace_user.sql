-- Canonical role labels (same values in UI and DB columns).

-- app_users.global_role: super admin | member
alter table public.app_users drop constraint if exists app_users_global_role_check;
update public.app_users set global_role = 'super admin' where global_role = 'super_admin';
alter table public.app_users add constraint app_users_global_role_check
  check (global_role in ('super admin', 'member'));

comment on column public.app_users.global_role is
  'super admin: access any workspace, create/delete workspaces. member: use workspace_memberships only.';

-- workspace_memberships.role: workspace admin | user
alter table public.workspace_memberships drop constraint if exists workspace_memberships_role_check;
update public.workspace_memberships set role = 'workspace admin' where role in ('owner', 'admin');
update public.workspace_memberships set role = 'user' where role in ('operator', 'viewer');
alter table public.workspace_memberships alter column role set default 'user';
alter table public.workspace_memberships add constraint workspace_memberships_role_check
  check (role in ('workspace admin', 'user'));

-- workspace_invites.role
alter table public.workspace_invites drop constraint if exists workspace_invites_role_check;
update public.workspace_invites set role = 'workspace admin' where role in ('owner', 'admin');
update public.workspace_invites set role = 'user' where role in ('operator', 'viewer');
alter table public.workspace_invites alter column role set default 'user';
alter table public.workspace_invites add constraint workspace_invites_role_check
  check (role in ('workspace admin', 'user'));
