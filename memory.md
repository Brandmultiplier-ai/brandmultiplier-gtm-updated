# BrandMultiplier GTM — Memory

Last updated: 2026-04-07

## Overview

BrandMultiplier GTM is a private LinkedIn outreach operating system built on:

- Next.js
- Vercel
- Supabase
- Unipile

It is now a standalone deployed app. Production no longer depends on the local Mac staying online.

Runtime URL:

- `https://brandmultiplier-gtm.vercel.app`

Source control:

- `https://github.com/viluca94/brandmultiplier-gtm`

## Current Live Stack

```text
GitHub (viluca94/brandmultiplier-gtm)
  -> Vercel project: brandmultiplier-gtm
     -> Next.js app + API routes
     -> UI protected by basic auth
     -> public cron/webhook endpoints protected by shared secrets
  -> Supabase Postgres
     -> source of truth for campaigns, leads, seats, templates, runs
     -> job_locks table + cron RPC
  -> Unipile
     -> LinkedIn account access
     -> inbox + chat sync
     -> inbound webhooks
```

Production storage is Supabase. Local `data/` is legacy/dev-only.

## Hard Constraints

- `app.claw4ghrowth.com` is a separate project and must not be touched here.
- `GOJIBERRY_*` is only reverse-engineering context and must never be uploaded to Vercel.
- The repo may still contain local-only legacy docs/scripts as untracked files. They are not part of production.

## What Was Implemented

### Infrastructure

- GitHub repo created and connected to Vercel.
- Deploy flow is Git-based from `main`.
- Supabase became the production source of truth.
- Legacy JSON state was migrated to Supabase.
- Public cron endpoint added at `/api/cron/run`.
- Unipile webhooks point to `/api/webhooks`.
- UI is protected by HTTP basic auth.
- `/api/webhooks` and `/api/cron/run` are shared-secret protected.

### Core Product

- Dashboard period filters
- Campaign settings persistence
- Campaign pause/resume
- Campaign duplicate/delete/toggle
- Campaign sequence editing
- Sequence editing directly inside the workflow canvas
- Add/delete trailing follow-up steps from the canvas
- Templates CRUD
- Leads lists CRUD
- Insights date range filtering
- Copilot approve/remove/message persistence
- Copilot mode persistence
- Unibox live chat fetch/send through Unipile
- Unibox export

### Runtime / Automation

- Shared automation runner in `src/lib/automation-runner.ts`
- Sequence runner in `src/lib/sequence-runner.ts`
- Outreach runner in `src/lib/outreach-engine.ts`
- Supabase job lock RPCs for cron concurrency control
- Supabase cron scheduled every 15 minutes

### LinkedIn Seat Model

- LinkedIn seat entity added
- Weekly quotas for:
  - invitations
  - messages
  - profile lookups
- Active days
- Launch hour
- Randomized launch window
- Usage counters
- Seat assignment visible in Settings and Campaign workflow

### Campaign Routing

- Market and language routing moved into campaign logic
- Current intended routing:
  - `Italy` -> IT campaign
  - `outside Italy` -> EN campaign
- Campaign language is the source of truth for copy
- Mismatch leads are skipped or moved, not force-sent with wrong language

### Sequence Behavior

- Step 1 is the invite
- Step 2+ are follow-up messages
- Step 2 currently triggers `1 day after accepted`
- `no_reply` follow-ups use prior step anchor timestamps
- Reply from the lead stops automated sequence progression
- Manual outbound intervention now triggers `manual_override` behavior so the automation does not keep pushing that lead

### Unibox / Inbox Sync

- Unibox uses real Unipile chats where possible
- Clicking a conversation hydrates the real thread messages
- Manual messages and externally-sent LinkedIn messages are reconciled back into sequence state

## Important Logic Decisions

### Review vs Autopilot

- `review` mode:
  - lead gets queued
  - no auto-send
- `autopilot` mode:
  - sends automatically according to seat quota, pacing, and schedule

For invite copy in autopilot:

- `Campaign Step 1` means use campaign step 1 as source of truth
- `Template Library` means choose from template library

For queued review drafts:

- `Use current source of truth` ignores old saved drafts
- `Reuse saved personalized drafts` reuses drafts created during review mode

Default intended behavior is deterministic:

- use campaign step 1
- ignore old review drafts unless explicitly requested

### Brain / Experiments

Brain experiments are no longer an active control layer for operations.

Current position:

- Brain remains mostly analytics/passive
- It should not be treated as the source of truth for live outreach behavior
- Campaign copy + seat controls are the operational truth

## Key Fixes Made Recently

### 1. Follow-up path fixed

Problem:

- live sequence messages were not sending correctly in some cases

Fix:

- sequence now prefers known `unipileChatId`
- it no longer tries to recreate chats unnecessarily for follow-ups

### 2. Manual send reconciliation fixed

Problem:

- messages sent manually on LinkedIn or from Unibox were not always reflected correctly in sequence state

Fix:

- manual outbound now reconciles into lead state
- sequence stops after manual takeover

### 3. False market matches fixed

Problem:

- location matcher had false positives such as `Roma` inside `Romania`

Fix:

- targeting logic was hardened
- regression tests added

### 4. Language/campaign mismatch fixed

Problem:

- EN leads inside IT campaigns could receive Italian copy

Fix:

- campaign language now drives copy eligibility
- leads outside campaign language are skipped or moved instead of fallback-sent

### 5. Unibox hydration fixed

Problem:

- left sidebar showed chats, but center panel could remain empty or crash

Fix:

- selected conversation now fetches thread details
- client-side hydration/render issues were fixed

### 6. Cron timeout fixed

Problem:

- Supabase cron called `/api/cron/run` with a `10s` HTTP timeout
- a real automation tick takes about `22-25s`
- cron could therefore time out before the app returned

Fix:

- SQL function for cron scheduling was updated to accept a configurable timeout
- cron was reconfigured to use `300000ms`
- this is a structural fix and was verified against production

Files:

- `scripts/configure-supabase-cron.ts`
- `supabase/migrations/20260330130000_cron_http_timeout.sql`

### 7. Dry-run history pollution fixed

Problem:

- dry-run outreach runs were still being saved in `outreach_runs`
- UI could show fake `sent` history

Fix:

- dry-run logging bug removed from `src/lib/outreach-engine.ts`
- known false rows were deleted from production

## Current Automation Behavior

- cron runs every 15 minutes
- campaigns send at most one invite per live tick
- pacing respects `nextInviteAt`
- once campaign/seat/day quota is exhausted, system waits until next valid window
- sequences and outreach run in the same automation tick

## Warmup

Warmup logic exists, but as of this memory update it is not the primary live mode yet.

Important note:

- the seat has warmup support implemented
- but recent operation was still running mostly on manual target quotas
- warmup should be enabled when the account is stable and we want progressive autonomous ramp-up

Intended future direction:

- target quota set manually in UI
- warmup ramps toward that target automatically
- rate limit events reset or downgrade warmup stage

## Current Operational Direction

Primary direction is `autopilot`, but not “black box AI”.

Desired model:

- deterministic operational autopilot
- campaign-driven copy
- seat-driven pacing
- automatic scheduling
- automatic follow-ups
- automatic safety throttles
- optional copilot for assisted replies and exceptions

What still makes sense to add next:

- enable real warmup progression in live mode
- auto-pause / auto-cooldown on new provider rate limits
- clearer UI reasons for `waiting`
- copilot inbound drafts for replied leads
- explicit activity log separating real runs from previews/dry-runs

## Frontend Backlog For Claude

Backend is now ready for a separate `Signals -> Leads` pipeline.

Already live on backend:

- new table: `signal_candidates`
- topic-ready metadata on each signal:
  - `topicKey`
  - `topicLabel`
  - `signalKind`
  - `signalPayload`
- persistence in discovery before lead promotion
- statuses:
  - `new`
  - `shortlisted`
  - `promoted`
  - `dismissed`
- API route:
  - `GET /api/signals`
- current fields available per signal:
  - person identity
  - source
  - topic
  - signal kind
  - signal context
  - ICP fit
  - intent score
  - total score
  - agent
  - campaign
  - status

Important FE direction:

- do **not** merge Signals into Leads UI
- Signals must stay a separate pool from promoted leads
- Leads remain the operational campaign pipeline
- Signals are the awareness/discovery pool that can be re-filtered later

What FE still needs:

- stable `Signals` page integrated into the ongoing UI refactor
- filters:
  - by status
  - by source
  - by topic
  - by signal kind
  - by agent
  - by campaign
  - by score / search query
- row/card details:
  - headline
  - location
  - signal source label
  - signal context
  - scores
  - reasoning
  - current status
- actions:
  - `Promote to lead`
  - `Dismiss`
  - `Restore`
  - bulk `Promote shortlisted`
- visual distinction:
  - `signal only`
  - `shortlisted`
  - `already promoted`
- link from a promoted signal to the corresponding lead when `leadId` exists

Live backend hooks available for FE:

- `GET /api/signals`
  - now supports `topicKey` and `signalKind` query params
- `GET /api/signals/[id]`
- `PATCH /api/signals/[id]` for status changes and campaign reassignment
- `POST /api/signals/promote` for explicit single or bulk promotion into leads
- backend helper: `src/lib/signal-promotion.ts`
- backend backfill script: `scripts/backfill-signal-candidates.ts`

Important operational note:

- historical lead-backed signals have already been backfilled
- signal metadata can also be normalized/backfilled with `scripts/backfill-signal-metadata.ts`
- brand/topic discovery is now reusable: backend derives canonical topic metadata from `selectedTopics` first, then falls back to `engagementKeywords`

## Canonical Files

- `README.md`
- `CLAUDE.md`
- `docs/PROJECT-STATUS.md`
- `docs/GO-LIVE-CHECKLIST.md`
- `memory.md`

## Practical Commands

```bash
npm run dev
npm run build
npm run outreach:dry
npm run cron:configure
npm run webhooks:configure
```
