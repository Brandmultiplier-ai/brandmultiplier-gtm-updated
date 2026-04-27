# BrandMultiplier GTM -> Multi-Tenant GTM Platform

## Goal

Transform BrandMultiplier GTM from a single-tenant LinkedIn outreach tool into a multi-tenant GTM platform with:

- isolated workspaces per client
- per-workspace channel credentials
- future multi-channel execution
- a project brain and a global anonymized brain

## Phase Order

1. Workspace Layer
2. LinkedIn Client Factory
3. UI Workspace Awareness
4. Channel Abstraction
5. Brain System
6. Email Channel

Phase 0 is the critical foundation. Phases 1 and 2 can proceed in parallel once Phase 0 is complete.

## Phase 0: Workspace Layer

### Objective

Add the workspace concept without breaking existing data or routes.

### Data Model

Add `Workspace` and `ChannelType` in [types.ts](/Users/lucavizzielli/Desktop/VibeCoding/Projects/brandmultiplier-gtm/src/lib/types.ts).

```ts
export type ChannelType = "linkedin" | "email" | "ads";

export interface Workspace {
  id: string; // ws_xxxxxxxx
  name: string;
  slug: string;
  status: "active" | "paused" | "archived";
  niche: string;
  defaultLanguage: "it" | "en";
  channels: {
    linkedin?: {
      unipileAccountId: string;
      unipileApiKey: string;
      unipileBaseUrl: string;
    };
    email?: {
      provider: "instantly";
      apiKey: string;
    };
  };
  createdAt: string;
  updatedAt: string;
}
```

Add `workspaceId: string` to:

- `Agent`
- `Campaign`
- `Lead`
- run and log entities written by the app, especially discovery and outreach runs

### Storage

- `data/workspaces/ws_xxx.json`
- existing `agents`, `campaigns`, `leads` stay flat on disk
- filtering happens by `workspaceId`
- dedupe index remains global by product decision

### Store Changes

In [store.ts](/Users/lucavizzielli/Desktop/VibeCoding/Projects/brandmultiplier-gtm/src/lib/store.ts):

- add `getWorkspace`, `listWorkspaces`, `saveWorkspace`, `deleteWorkspace`
- make existing list/get functions workspace-aware
- default legacy records without `workspaceId` to `ws_default`
- keep filtering explicit in all API routes

### Workspace Context

Create [workspace-context.ts](/Users/lucavizzielli/Desktop/VibeCoding/Projects/brandmultiplier-gtm/src/lib/workspace-context.ts):

- `getWorkspaceId(req)` reads `X-Workspace-Id`
- fallback to `?workspaceId=`
- fallback to `ws_default`

### Migration

Migration script (completed and removed):

- create `ws_default`
- read current Unipile env values from `.env.local`
- stamp `workspaceId: "ws_default"` on all existing agents, campaigns and leads
- backfill discovery and outreach run logs when possible

Migration must be idempotent:

- running it twice must not duplicate workspaces
- existing `workspaceId` values must not be overwritten
- logs should only be backfilled when the field is missing

### API Scope

All data-serving or data-mutating routes must resolve a workspace and pass it to store functions.

Notes:

- routes that still use singleton channel clients remain globally configured until Phase 1
- Phase 0 isolates data, not external provider credentials

### Verification

1. Create `ws_default` and migrate existing data.
2. Create a second workspace.
3. Create an agent in the second workspace.
4. Verify dashboard, leads and campaigns are scoped by workspace.
5. Verify `npx tsc --noEmit` passes after migration support is added.

## Security Note

Storing tenant credentials inside workspace JSON is acceptable only as a temporary local-dev step.

Before real multi-tenant deployment, workspace metadata and workspace secrets must be separated.

