-- ── BrandMultiplier GTM — reset app auth (Supabase SQL editor) ─────────────
-- Removes ALL app users, memberships, and workspace invites.
-- Workspaces, leads, campaigns, etc. are NOT deleted — only auth/tenancy links.
-- Export a backup before running in production.

delete from public.workspace_invites;
delete from public.workspace_memberships;
delete from public.app_users;

-- After this, run: npx tsx scripts/seed-superadmin.ts
-- (with BM_GTM_SEED_SUPERADMIN_* in .env.local), then sign in at /login.
