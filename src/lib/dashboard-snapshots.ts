import * as store from "@/lib/store";
import { getJsonCache, setJsonCache } from "@/lib/redis-cache";
import type { Campaign, DashboardPeriod, DashboardSnapshot, Lead, LeadEvent } from "@/lib/types";

function getPeriodStart(now: Date, period: DashboardPeriod): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === "7d") start.setDate(start.getDate() - 6);
  else if (period === "30d") start.setDate(start.getDate() - 29);
  else if (period === "3m") start.setDate(start.getDate() - 89);
  else return new Date(now.getFullYear(), now.getMonth(), 1);
  return start;
}

function isWithinPeriod(isoDate: string | undefined, start: Date, end: Date): boolean {
  if (!isoDate) return false;
  const ts = Date.parse(isoDate);
  return Number.isFinite(ts) && ts >= start.getTime() && ts <= end.getTime();
}

function leadHasEventInPeriod(lead: Lead, types: LeadEvent["type"][], start: Date, end: Date): boolean {
  return lead.events.some((event) => types.includes(event.type) && isWithinPeriod(event.ts, start, end));
}

function computePeriodStats(leads: Lead[], start: Date, end: Date) {
  const discovered = leads.filter((lead) => isWithinPeriod(lead.createdAt, start, end));
  const contacted = leads.filter((lead) => leadHasEventInPeriod(lead, ["invite_sent"], start, end));
  const accepted = leads.filter((lead) => leadHasEventInPeriod(lead, ["accepted"], start, end));
  const replied = leads.filter((lead) => leadHasEventInPeriod(lead, ["replied"], start, end));
  const pending = leads.filter((lead) => leadHasEventInPeriod(lead, ["rate_limited"], start, end));
  return {
    totalContacted: contacted.length,
    totalDiscovered: discovered.length,
    totalSent: contacted.length,
    totalAccepted: accepted.length,
    totalReplied: replied.length,
    totalPending: pending.length,
    connectRate: contacted.length > 0 ? Math.round((accepted.length / contacted.length) * 100) : 0,
    replyRate: contacted.length > 0 ? Math.round((replied.length / contacted.length) * 100) : 0,
  };
}

function computeCampaignStats(campaign: Campaign, leads: Lead[], start: Date, end: Date) {
  const campaignLeads = leads.filter((lead) => lead.campaignId === campaign.id);
  const sent = campaignLeads.filter((lead) => leadHasEventInPeriod(lead, ["invite_sent"], start, end)).length;
  const accepted = campaignLeads.filter((lead) => leadHasEventInPeriod(lead, ["accepted"], start, end)).length;
  const replied = campaignLeads.filter((lead) => leadHasEventInPeriod(lead, ["replied"], start, end)).length;
  const errored = campaignLeads.filter((lead) => leadHasEventInPeriod(lead, ["invite_failed"], start, end)).length;
  return {
    totalLeads: campaignLeads.filter((lead) => isWithinPeriod(lead.createdAt, start, end)).length,
    sent,
    accepted,
    replied,
    errored,
    connectRate: sent > 0 ? Math.round((accepted / sent) * 100) : 0,
    replyRate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
  };
}

function countInvitesThisWeek(leads: Lead[], now: Date) {
  const start = new Date(now);
  const day = start.getDay();
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
  start.setHours(0, 0, 0, 0);
  return leads.filter((lead) => leadHasEventInPeriod(lead, ["invite_sent"], start, now)).length;
}

export async function computeDashboardPayload(workspaceId: string, period: DashboardPeriod) {
  const [agents, campaigns, allLeads] = await Promise.all([
    store.listAgents(workspaceId),
    store.listCampaigns({ workspaceId }),
    store.getAllLeads({ workspaceId }),
  ]);
  const now = new Date();
  const periodStart = getPeriodStart(now, period);
  const stats = {
    ...computePeriodStats(allLeads, periodStart, now),
    activeAgents: agents.filter((agent) => agent.status === "active").length,
    activeCampaigns: campaigns.filter((campaign) => campaign.status === "active").length,
  };
  const recentLeads = allLeads
    .filter((lead) => isWithinPeriod(lead.createdAt, periodStart, now))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);
  const repliedLeads = allLeads
    .filter((lead) => leadHasEventInPeriod(lead, ["replied"], periodStart, now))
    .sort((a, b) => {
      const latestA = [...a.events].reverse().find((event) => event.type === "replied")?.ts || "";
      const latestB = [...b.events].reverse().find((event) => event.type === "replied")?.ts || "";
      return latestB.localeCompare(latestA);
    });
  const dayMap: Record<string, { discovered: number; invited: number; messaged: number; accepted: number; replied: number }> = {};
  for (let d = new Date(periodStart); d <= now; d.setDate(d.getDate() + 1)) {
    dayMap[d.toISOString().slice(0, 10)] = { discovered: 0, invited: 0, messaged: 0, accepted: 0, replied: 0 };
  }
  for (const lead of allLeads) {
    for (const event of lead.events) {
      if (!isWithinPeriod(event.ts, periodStart, now)) continue;
      const day = event.ts.slice(0, 10);
      if (!dayMap[day]) continue;
      if (event.type === "discovered") dayMap[day].discovered++;
      else if (event.type === "invite_sent") dayMap[day].invited++;
      else if (event.type === "message_sent") dayMap[day].messaged++;
      else if (event.type === "accepted") dayMap[day].accepted++;
      else if (event.type === "replied") dayMap[day].replied++;
    }
    const createdDay = lead.createdAt.slice(0, 10);
    if (isWithinPeriod(lead.createdAt, periodStart, now) && dayMap[createdDay] && !lead.events.some((event) => event.type === "discovered")) {
      dayMap[createdDay].discovered++;
    }
  }
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "active");
  const nextInviteAt = activeCampaigns
    .map((campaign) => campaign.execution?.nextInviteAt)
    .filter((value): value is string => typeof value === "string")
    .sort()[0];
  const agent = agents.find((item) => item.status === "active");
  const weeklyInvites = countInvitesThisWeek(allLeads, now);
  const weeklyLimit = agent?.limits.invitesPerWeek || 100;
  return {
    period,
    stats,
    agents,
    campaigns: campaigns.map((campaign) => ({
      ...campaign,
      stats: computeCampaignStats(campaign, allLeads, periodStart, now),
    })),
    recentLeads,
    repliedLeads,
    activityTimeline: Object.entries(dayMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, counts]) => ({ date, ...counts })),
    nextActions: {
      pendingFollowUp: allLeads.filter((lead) => ["accepted", "message_sent"].includes(lead.status)).length,
      pendingInvites: allLeads.filter((lead) => lead.status === "invite_sent").length,
      weeklyInvites,
      weeklyLimit,
      dailyLimit: agent?.limits.invitesPerDay || 20,
      weeklyRemaining: Math.max(0, weeklyLimit - weeklyInvites),
      nextRunAt: (nextInviteAt ? new Date(nextInviteAt) : new Date(now.getTime() + 5 * 60 * 1000)).toISOString(),
    },
  };
}

function cacheKey(workspaceId: string, period: DashboardPeriod) {
  return `dashboard:${workspaceId}:${period}`;
}

export async function refreshDashboardSnapshot(
  workspaceId: string,
  period: DashboardPeriod,
): Promise<DashboardSnapshot> {
  const payload = await computeDashboardPayload(workspaceId, period);
  const snapshot = await store.saveDashboardSnapshot({
    workspaceId,
    period,
    payload,
    computedAt: new Date().toISOString(),
  });
  await setJsonCache(cacheKey(workspaceId, period), snapshot, 3600);
  return snapshot;
}

export async function getDashboardSnapshotPayload(workspaceId: string, period: DashboardPeriod) {
  const cached = await getJsonCache<DashboardSnapshot>(cacheKey(workspaceId, period));
  if (cached?.payload) return { ...cached.payload, cached: true, computedAt: cached.computedAt };

  const saved = await store.getDashboardSnapshot(workspaceId, period);
  if (saved?.payload) {
    await setJsonCache(cacheKey(workspaceId, period), saved, 3600);
    return { ...saved.payload, cached: true, computedAt: saved.computedAt };
  }

  const fresh = await refreshDashboardSnapshot(workspaceId, period);
  return { ...fresh.payload, cached: false, computedAt: fresh.computedAt };
}
