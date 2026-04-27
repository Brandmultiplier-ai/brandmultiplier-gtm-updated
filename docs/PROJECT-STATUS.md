# BrandMultiplier GTM — Project Status

Last updated: 2026-03-20

## Current State

BrandMultiplier GTM is now running as a standalone deployed app backed by Supabase.

Live stack:

- GitHub repo: `https://github.com/viluca94/brandmultiplier-gtm`
- Vercel project: `brandmultiplier-gtm`
- Runtime URL: `https://brandmultiplier-gtm.vercel.app`
- Database: Supabase project `vzangnireejlxvswdhph`
- Messaging provider: Unipile

Production runtime no longer depends on the local laptop being on.

## Infrastructure Completed

### Git / Deploy

- Clean `main` branch created for GitHub
- Private repo created and pushed
- Vercel project connected to GitHub via `vercel git connect`
- Deploy flow should be Git-based from `main`

### Storage

- Supabase is the production source of truth
- Legacy JSON data was migrated to Supabase
- `src/lib/store.ts` now switches between local and Supabase backends

Migrated entities include:

- workspaces
- agents
- campaigns
- leads
- templates
- discovery runs
- outreach runs
- brain snapshots

### Automation

- Shared server-side runner added in `src/lib/automation-runner.ts`
- Public cron entrypoint added in `src/app/api/cron/run/route.ts`
- Supabase lock + cron RPC added in `supabase/migrations/20260320131500_automation_runtime.sql`
- Supabase cron configured to hit `/api/cron/run` every 15 minutes

### Webhooks

- Unipile webhooks now target `https://brandmultiplier-gtm.vercel.app/api/webhooks`
- Webhook receiver validates shared secret
- Receiver maps accepted connections and inbound messages back to leads when possible

### Security

- UI protected by HTTP basic auth
- `/api/webhooks` and `/api/cron/run` are publicly reachable but shared-secret protected
- `/api/workspaces` no longer leaks Unipile credentials

## Product Status

### Implemented

- Dashboard period filter
- Copilot approve/remove/message persistence
- Copilot mode persistence
- Copilot export
- Unibox real message fetch/send
- Unibox export
- Campaign detail save settings
- Campaign pause/resume
- Campaign contacts reject
- Campaign list actions: duplicate/delete/toggle
- Templates CRUD
- Insights date range filter
- Leads lists CRUD
- Company enrichment for Copilot/Unibox

### Operational Notes

- `review` mode queues leads for approval
- `autopilot` mode can flush queued leads left behind from review mode
- Unibox relies on Unipile chat mapping and stored lead identifiers
- Brain analysis and experiment lifecycle run as part of the automation tick

## What Is Out Of Scope

- `app.claw4ghrowth.com` is a different project and must not be touched here
- `GOJIBERRY_*` content is only for reverse engineering and must not go to Vercel

Repo hygiene already applied:

- `data/` ignored
- `logs/` ignored
- `docs/GOJIBERRY-*` ignored

## Remaining Known Gaps

- Real live validation of first outbound LinkedIn flow after unblocking is still pending
- Auth is basic auth, not product-grade auth
- Preview branch workflow has not been formalized yet

## Canonical Commands

```bash
npm run dev
npm run build
npm run outreach:dry
npm run cron:configure
npm run webhooks:configure
npx tsx scripts/migrate-json-to-supabase.ts
```

## Current Canonical Files

- `README.md`
- `CLAUDE.md`
- `docs/PROJECT-STATUS.md`
- `docs/GO-LIVE-CHECKLIST.md`
- `src/lib/automation-runner.ts`
- `src/app/api/cron/run/route.ts`
- `src/app/api/webhooks/route.ts`
- `src/lib/store.ts`
