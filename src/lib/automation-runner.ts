import { analyzeWorkspace } from "./brain";
import { runLifecycle } from "./brain/experiment-lifecycle";
import { BRAIN_EXPERIMENTS_ENABLED } from "./brain/feature-flags";
import { syncInbox } from "./inbox-sync";
import { runOutreach } from "./outreach-engine";
import { runSequence } from "./sequence-runner";
import * as store from "./store";
import type { Campaign } from "./types";

export interface AutomationTickOptions {
  workspaceId?: string;
  campaignId?: string;
  dryRun?: boolean;
  maxInvites?: number;
  onLog?: (line: string) => void;
}

export interface AutomationCampaignResult {
  campaignId: string;
  workspaceId: string;
  name: string;
  sequence: {
    synced: number;
    messaged: number;
    skipped: number;
    errors: number;
  };
  outreach: {
    status: string;
    sent: number;
    skipped: number;
    errors: number;
  };
}

export interface AutomationWorkspaceResult {
  workspaceId: string;
  leadsAnalyzed: number;
  campaignsAnalyzed: number;
  recommendationCount: number;
  lifecycleEvents: number;
}

export interface AutomationTickResult {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  inbox: {
    checked: number;
    newReplies: number;
    errors: string[];
  };
  campaigns: AutomationCampaignResult[];
  workspaces: AutomationWorkspaceResult[];
  errors: string[];
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runAutomationTick(opts: AutomationTickOptions): Promise<AutomationTickResult> {
  const {
    workspaceId,
    campaignId,
    dryRun = false,
    maxInvites,
    onLog,
  } = opts;

  const log = onLog || (() => {});
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  const campaignResults: AutomationCampaignResult[] = [];
  const workspaceResults: AutomationWorkspaceResult[] = [];

  log("BrandMultiplier GTM — Campaign Runner");
  log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  log("");

  let campaigns: Campaign[] = [];
  if (campaignId) {
    const campaign = await store.getCampaign(campaignId, workspaceId);
    if (campaign) {
      campaigns = [campaign];
    } else {
      errors.push(`Campaign ${campaignId} not found`);
    }
  } else {
    campaigns = (await store.listCampaigns({ workspaceId })).filter((campaign) => campaign.status === "active");
  }

  const inboxResult = await syncInbox(workspaceId);
  log("--- Phase 0: Inbox Sync ---");
  log(`  Checked: ${inboxResult.checked} chats`);
  if (inboxResult.newReplies.length > 0) {
    log(`  New replies: ${inboxResult.newReplies.length}`);
  } else {
    log("  No new replies");
  }
  for (const error of inboxResult.errors) {
    log(`  [ERR] ${error}`);
  }
  log("");

  if (campaigns.length === 0) {
    log("No active campaigns found");
  }

  for (const campaign of campaigns) {
    log(`== ${campaign.name} (${campaign.id}) ==`);
    log("");

    try {
      log("--- Phase 1: Sync & Follow-up ---");
      const sequenceResult = await runSequence({
        workspaceId: campaign.workspaceId,
        campaignId: campaign.id,
        dryRun,
        onEvent: (event) => {
          if (event.type === "synced") log(`  [SYNC] ${event.leadName}: ${event.message}`);
          else if (event.type === "messaged") log(`  [MSG] ${event.leadName} (step ${event.step}): ${event.message}`);
          else if (event.type === "error") log(`  [ERR] ${event.leadName}: ${event.reason}`);
          else if (event.type === "skipped") log(`  [SKIP] ${event.leadName}: ${event.reason}`);
          else if (event.type === "info") log(`  ${event.message}`);
        },
      });
      log(`  Synced: ${sequenceResult.synced}, Messaged: ${sequenceResult.messaged}`);
      log("");

      log("--- Phase 2: New Outreach ---");
      const outreachResult = await runOutreach({
        workspaceId: campaign.workspaceId,
        campaignId: campaign.id,
        dryRun,
        maxInvites,
        inlineSendNewProspects: false,
        onEvent: (event) => {
          if (event.type === "sent") log(`  [SENT] ${event.name} (${event.location})`);
          else if (event.type === "skipped") log(`  [SKIP] ${event.name}: ${event.reason}`);
          else if (event.type === "error") log(`  [ERR] ${event.name}: ${event.reason}`);
          else if (event.type === "rate_limited") log(`  [LIMIT] ${event.message}`);
          else if (event.type === "info") log(`  ${event.message}`);
        },
      });
      log(`  Sent: ${outreachResult.sent}, Skipped: ${outreachResult.skipped}, Errors: ${outreachResult.errors}`);
      log("");

      campaignResults.push({
        campaignId: campaign.id,
        workspaceId: campaign.workspaceId,
        name: campaign.name,
        sequence: {
          synced: sequenceResult.synced,
          messaged: sequenceResult.messaged,
          skipped: sequenceResult.skipped,
          errors: sequenceResult.errors,
        },
        outreach: {
          status: outreachResult.status,
          sent: outreachResult.sent,
          skipped: outreachResult.skipped,
          errors: outreachResult.errors,
        },
      });
    } catch (error) {
      const message = `Campaign ${campaign.id}: ${toErrorMessage(error)}`;
      errors.push(message);
      log(`  [ERR] ${message}`);
      log("");
    }
  }

  const workspaceIds = new Set<string>();
  for (const campaign of campaigns) workspaceIds.add(campaign.workspaceId);
  if (workspaceId) workspaceIds.add(workspaceId);

  for (const currentWorkspaceId of workspaceIds) {
    try {
      log(`--- Phase 3: Brain Analysis (${currentWorkspaceId}) ---`);
      const snapshot = await analyzeWorkspace(currentWorkspaceId);
      log(`  Analyzed ${snapshot.leadsAnalyzed} leads, ${snapshot.campaignsAnalyzed} campaigns`);
      log(`  Funnel: ${snapshot.patterns.overall.sent} sent -> ${snapshot.patterns.overall.accepted} accepted (${snapshot.patterns.overall.connectRate}%) -> ${snapshot.patterns.overall.replied} replied (${snapshot.patterns.overall.replyRate}%)`);
      log("");

      log(`--- Phase 4: Experiment Lifecycle (${currentWorkspaceId}) ---`);
      const lifecycleEvents = BRAIN_EXPERIMENTS_ENABLED
        ? await runLifecycle(currentWorkspaceId, snapshot)
        : [];
      if (!BRAIN_EXPERIMENTS_ENABLED) {
        log("  Brain experiments paused");
      } else if (lifecycleEvents.length === 0) {
        log("  No experiment activity");
      } else {
        for (const event of lifecycleEvents) {
          log(`  [${event.type}] ${event.experimentId ? `${event.experimentId} - ` : ""}${event.message}`);
        }
      }
      log("");

      workspaceResults.push({
        workspaceId: currentWorkspaceId,
        leadsAnalyzed: snapshot.leadsAnalyzed,
        campaignsAnalyzed: snapshot.campaignsAnalyzed,
        recommendationCount: snapshot.recommendations.length,
        lifecycleEvents: lifecycleEvents.length,
      });
    } catch (error) {
      const message = `Workspace ${currentWorkspaceId}: ${toErrorMessage(error)}`;
      errors.push(message);
      log(`  [ERR] ${message}`);
      log("");
    }
  }

  log("Done.");

  return {
    ok: errors.length === 0,
    startedAt,
    finishedAt: new Date().toISOString(),
    dryRun,
    inbox: {
      checked: inboxResult.checked,
      newReplies: inboxResult.newReplies.length,
      errors: inboxResult.errors,
    },
    campaigns: campaignResults,
    workspaces: workspaceResults,
    errors,
  };
}
