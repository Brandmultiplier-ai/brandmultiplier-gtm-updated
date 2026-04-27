# CLAUDE.md — BrandMultiplier GTM

Operational memory for future coding sessions.

## Product

BrandMultiplier GTM is a private outreach app for running LinkedIn workflows through Unipile.

Primary surfaces:

- Dashboard
- Campaigns
- Copilot
- Unibox
- Leads
- Insights
- Settings

## Runtime Architecture

```text
GitHub repo: viluca94/brandmultiplier-gtm
  -> Vercel project: brandmultiplier-gtm
     -> Next.js app router
     -> API routes
     -> basic auth protected UI
  -> Supabase Postgres
     -> primary data store
     -> cron lock table / RPC
  -> Unipile
     -> LinkedIn account access
     -> users + messaging webhooks
```

Production is no longer tied to the local Mac for runtime.

- Vercel serves the app and API
- Supabase stores state
- Supabase cron triggers automation
- Unipile hits Vercel webhooks

Local filesystem storage still exists as a fallback/dev mode only.

## Storage

`src/lib/store.ts` switches backend dynamically:

- Supabase when `BM_GTM_STORAGE=supabase` or Supabase envs are present
- local filesystem otherwise

Relevant files:

- `src/lib/storage-mode.ts`
- `src/lib/store.ts`
- `src/lib/store-local.ts`
- `src/lib/store-supabase.ts`

Production source of truth is Supabase.

`data/` should be treated as legacy/local backup, not production state.

## Security

UI access is protected by HTTP basic auth in `middleware.ts`.

Public paths:

- `/_next`
- `/_vercel`
- `/api/webhooks`
- `/api/cron/run`

Public does not mean open:

- `/api/webhooks` requires `BM_GTM_WEBHOOK_SECRET`
- `/api/cron/run` requires `BM_GTM_CRON_SECRET`

`/api/workspaces` was sanitized and must not expose Unipile secrets.

## Automation Runtime

Main runner:

- `src/lib/automation-runner.ts`

Tick endpoint:

- `src/app/api/cron/run/route.ts`

Phases:

1. inbox sync
2. per-campaign sequence runner
3. per-campaign outreach runner
4. workspace brain analysis
5. experiment lifecycle

Locking:

- `src/lib/job-lock.ts`
- Supabase migration `supabase/migrations/20260320131500_automation_runtime.sql`

Current known live schedule:

- job name: `bm_gtm_automation_tick`
- schedule: `*/15 * * * *`

Provisioning script:

- `scripts/configure-supabase-cron.ts`

## Webhooks

Webhook receiver:

- `src/app/api/webhooks/route.ts`

The route currently handles:

- accepted connections: `connection_accepted`, `invitation_accepted`, `new_relation`
- inbound messages: `message_received`, `new_message`

Correlation strategy:

- map webhook provider ID to lead via store lookup
- mark accepted/replied on the lead
- persist raw event into webhook event storage

Provisioning script:

- `scripts/configure-unipile-webhooks.ts`

Managed webhook names:

- `brandmultiplier-gtm-connections`
- `brandmultiplier-gtm-messages`

## Copilot / Outreach Rules

Copilot mode is now persistent, not UI-only.

- `review`: queue leads for approval
- `autopilot`: send directly

When switching from `review` to `autopilot`, queued `new` / `discovered` leads are flushed by the outreach engine instead of being stranded.

Relevant files:

- `src/app/api/copilot/route.ts`
- `src/app/copilot/page.tsx`
- `src/lib/outreach-engine.ts`

## Unibox

Unibox now tries to use real Unipile chat data and sends via the mapped chat ID.

Relevant files:

- `src/app/api/unibox/route.ts`
- `src/app/unibox/page.tsx`
- `src/lib/inbox-sync.ts`
- `src/lib/unipile.ts`

## Campaign / Leads / Templates

Implemented and persisted:

- campaign settings patch
- campaign pause/resume
- contact reject
- campaign duplicate/delete from list
- templates CRUD
- leads lists CRUD
- dashboard period filter
- insights date range filter

## Deploy State

Repository:

- GitHub: `https://github.com/viluca94/brandmultiplier-gtm`

Vercel:

- project: `brandmultiplier-gtm`
- linked to GitHub repo
- deploy flow should be `git push origin main`

Do not rely on manual local deploys unless debugging.

## What Must Not Be Touched

- `app.claw4ghrowth.com` is a separate project
- `GOJIBERRY_*` is reverse-engineering context only

`GOJIBERRY` docs should stay local-only and must not be uploaded to Vercel or treated as runtime dependencies.

## Known Residual Risks

- The app is operational, but a real end-to-end LinkedIn send/reply flow should still be verified once the account is fully unblocked.
- Auth is basic auth today; long term this should become real app auth.
- The service role key was shared during setup and should be rotated if not already rotated.

## Key Commands

```bash
npm run dev
npm run build
npm run outreach:dry
npm run cron:configure
npm run webhooks:configure
npx tsx scripts/migrate-json-to-supabase.ts
```

## Canonical Docs

- `README.md`
- `docs/PROJECT-STATUS.md`
- `docs/GO-LIVE-CHECKLIST.md`
