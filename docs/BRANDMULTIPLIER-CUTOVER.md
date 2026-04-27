# BrandMultiplier GTM Cutover Notes

This branch intentionally removes the previous app naming as a breaking cutover.

## Environment Variables

Use the `BM_GTM_*` prefix:

- `BM_GTM_SESSION_SECRET`
- `BM_GTM_APP_URL`
- `BM_GTM_BASIC_AUTH_USER`
- `BM_GTM_BASIC_AUTH_PASSWORD`
- `BM_GTM_BOOTSTRAP_SECRET`
- `BM_GTM_CRON_SECRET`
- `BM_GTM_WEBHOOK_SECRET`
- `BM_GTM_STORAGE`
- `BM_GTM_DATA_DIR`
- `BM_GTM_CRON_JOB_NAME`
- `BM_GTM_CRON_SCHEDULE`
- `BM_GTM_CRON_HTTP_TIMEOUT_MS`
- `BM_GTM_SEED_EMAIL`
- `BM_GTM_SEED_PASSWORD`
- `BM_GTM_WORKSPACE_ID`
- `BM_GTM_IT_CAMPAIGN_ID`
- `BM_GTM_EN_CAMPAIGN_ID`
- `BM_GTM_RUNTIME_ROOT`

Existing `SUPABASE_*`, `NEXT_PUBLIC_SUPABASE_URL`, and `UNIPILE_*` variables are unchanged.

## Runtime Contracts

- Session cookie: `bm_gtm_session`
- Active workspace cookie: `bm_gtm_active_workspace`
- JWT issuer/type: `brandmultiplier-gtm` / `bm_gtm_session`
- Cron secret header: `x-bm-cron-secret`
- Cron workspace header: `x-bm-cron-workspace`
- Webhook secret header: `x-bm-webhook-secret`
- Bootstrap header: `x-bm-bootstrap-secret`
- Default cron lock/job name: `bm_gtm_automation_tick`
- Unipile webhook names: `brandmultiplier-gtm-connections`, `brandmultiplier-gtm-messages`

## External Systems To Update

- Vercel environment variables must use the new `BM_GTM_*` names.
- Supabase cron should be reconfigured with `npm run cron:configure` after setting `BM_GTM_CRON_SECRET`.
- Unipile webhooks should be reconfigured with `npm run webhooks:configure` after setting `BM_GTM_WEBHOOK_SECRET`.
- Existing browser sessions are invalidated because cookie and JWT names changed.
