# BrandMultiplier GTM — Go-Live Checklist

Use this checklist when the LinkedIn account is unblocked and you want to resume live outreach safely.

Last updated: 2026-03-20

## Goal

Confirm that:

- Unipile can still access the correct LinkedIn account
- Vercel production is reachable
- Supabase-backed automation is healthy
- webhooks are being received
- one controlled live message/invite flow works end to end

## Before Starting

Make sure you have:

- access to `https://brandmultiplier-gtm.vercel.app`
- basic auth credentials for the app
- access to the LinkedIn account used by Unipile
- one safe test contact or test conversation

Do not use a broad active campaign as the first test.

## 1. Confirm App Access

Open:

- `https://brandmultiplier-gtm.vercel.app`

Verify:

- app loads after basic auth
- Dashboard loads without API errors
- campaigns and leads render normally

If this fails, stop and check Vercel envs and deployment logs first.

## 2. Confirm Unipile Account Health

In the app, verify that:

- existing conversations are visible in Unibox
- existing leads still show provider-linked data

If Unibox is empty or clearly stale:

- check whether the Unipile LinkedIn account needs reconnect
- verify `UNIPILE_API_KEY`, `UNIPILE_ACCOUNT_ID`, and `UNIPILE_BASE_URL`

## 3. Confirm Webhooks Are Still Pointing to Production

Expected production webhook target:

- `https://brandmultiplier-gtm.vercel.app/api/webhooks`

Expected managed webhook names:

- `brandmultiplier-gtm-connections`
- `brandmultiplier-gtm-messages`

If needed, re-apply with:

```bash
npm run webhooks:configure
```

## 4. Confirm Cron Is Still Registered

Expected schedule:

- `*/15 * * * *`

If needed, re-apply with:

```bash
npm run cron:configure
```

This should point Supabase cron to:

- `/api/cron/run`

## 5. Do One Controlled Outbound Test

Pick exactly one safe lead or conversation.

Preferred order:

1. send one message from Unibox to an existing chat
2. if that works, send one controlled campaign action

Verify:

- the message is accepted by the UI
- it appears on LinkedIn
- the conversation remains mapped correctly in Unibox

If the first message does not appear on LinkedIn, stop. Do not run campaigns.

## 6. Do One Controlled Inbound Test

Ask the same contact to reply, or reply from the test account.

Verify:

- webhook hits production
- lead status changes to `replied`
- the new message appears in Unibox

If reply sync does not happen:

- check webhook delivery first
- then inspect `/api/webhooks` handling and Unipile payload shape

## 7. Do One Controlled Accept Test

If possible, test one connection acceptance.

Verify:

- lead status changes to `accepted`
- the event is visible in the lead history/events flow

If accept sync is delayed, remember that Unipile relation events may not be instant.

## 8. Validate Automation Tick

Once manual send/reply looks healthy, validate the scheduled runner.

Expected automation phases:

1. inbox sync
2. sequence runner
3. outreach runner
4. brain analysis
5. experiment lifecycle

Watch for:

- duplicate sends
- leads stuck in wrong status
- approval queue not flushing when mode changes

## 9. Enable Real Usage Gradually

Do not immediately ramp volume.

Recommended ramp:

1. manual test only
2. one small campaign
3. observe one or two cron cycles
4. then resume normal usage

## 10. Post Go-Live Hygiene

After live validation succeeds:

- rotate `SUPABASE_SERVICE_ROLE_KEY`
- rotate any other secrets that were shared in chat
- optionally replace basic auth with proper app auth later

## Stop Conditions

Do not resume broad live outreach if any of these fail:

- Unibox cannot send a real message
- webhooks are not arriving
- replies do not map back to leads
- accept events are not reflected after a reasonable delay
- automation sends duplicates or skips expected state transitions

## Fast Recovery Commands

```bash
npm run build
npm run outreach:dry
npm run cron:configure
npm run webhooks:configure
```

## Current Production Assumptions

- app: `https://brandmultiplier-gtm.vercel.app`
- source: `https://github.com/viluca94/brandmultiplier-gtm`
- data: Supabase project `vzangnireejlxvswdhph`
- runtime: Vercel
- provider: Unipile
