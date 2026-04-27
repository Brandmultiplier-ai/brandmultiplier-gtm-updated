# BrandMultiplier GTM

BrandMultiplier GTM is a private outreach operating system built on Next.js, Unipile, Vercel, and Supabase.

It is now deployed as a standalone web app:

- App/runtime: `brandmultiplier-gtm` on Vercel
- Source control: `https://github.com/viluca94/brandmultiplier-gtm`
- Data store: Supabase Postgres
- Messaging/inbox provider: Unipile

## Current Architecture

```text
GitHub (viluca94/brandmultiplier-gtm)
  -> Vercel project: brandmultiplier-gtm
     -> Next.js app + API routes
     -> Basic auth for UI
     -> Public webhook/cron endpoints
  -> Supabase Postgres
     -> workspaces, agents, campaigns, leads, templates, lists
     -> webhook events, outreach runs, discovery runs, brain snapshots
     -> cron job lock + scheduled automation tick
  -> Unipile
     -> LinkedIn account access
     -> inbound webhooks to /api/webhooks
```

Local `data/` files are legacy/dev artifacts only. Production no longer depends on the laptop filesystem.

## What Works

- Dashboard period filtering
- Copilot approve/remove/message persistence
- Copilot mode persistence (`review` / `autopilot`)
- Unibox live chat fetch/send through Unipile
- Campaign settings save
- Campaign pause/resume
- Templates CRUD
- Leads lists CRUD
- Insights date range filtering
- Supabase-backed automation runtime
- Unipile webhooks into Vercel
- Supabase cron calling `/api/cron/run` every 15 minutes

## Important Constraints

- `app.claw4ghrowth.com` is a different project and must not be touched from here.
- `GOJIBERRY_*` docs/envs are only for reverse engineering. They are not part of production and must not be uploaded to Vercel.
- The UI is basic-auth protected. `/api/webhooks` and `/api/cron/run` stay public but require shared secrets.
- **App users & workspaces:** set `BM_GTM_SESSION_SECRET` in production, run Supabase migrations (including `app_users`, `workspace_memberships`, `provider_connections`, and workspace-scoped `leads` uniqueness), then use `/login` to bootstrap the first user with `BM_GTM_BOOTSTRAP_SECRET` (only when the `app_users` table is empty). The workspace switcher stores the active workspace in an `httpOnly` cookie; API routes do not treat `X-Workspace-Id` as authoritative.

## Key Docs

- [docs/PROJECT-STATUS.md](docs/PROJECT-STATUS.md): current handoff and live status
- [docs/GO-LIVE-CHECKLIST.md](docs/GO-LIVE-CHECKLIST.md): live validation checklist before resuming outreach
- [docs/BRANDMULTIPLIER-CUTOVER.md](docs/BRANDMULTIPLIER-CUTOVER.md): renamed env vars, cookies, headers, cron, and webhook identifiers
- [CLAUDE.md](CLAUDE.md): operational memory for future coding sessions
- [docs/UNIPILE-QUICKSTART.md](docs/UNIPILE-QUICKSTART.md): provider reference
- [docs/UNIPILE-API-REFERENCE.md](docs/UNIPILE-API-REFERENCE.md): provider reference

## Local Development

```bash
npm install
npm run dev
npm run build
```

## Useful Commands

```bash
npm run outreach:dry
npm run cron:configure
npm run webhooks:configure
npx tsx scripts/migrate-json-to-supabase.ts
```

## Deploy Flow

Deploys should now come from Git:

```bash
git add .
git commit -m "your change"
git push origin main
```

Vercel is connected to the GitHub repository and should build from `main`.
