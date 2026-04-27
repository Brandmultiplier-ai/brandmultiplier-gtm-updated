import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import type { Agent, Campaign, Lead, LeadEvent } from "@/lib/types";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";

export const dynamic = "force-dynamic";

function defaultRange() {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function parseRange(req: NextRequest) {
  const fallback = defaultRange();
  const startParam = req.nextUrl.searchParams.get("start");
  const endParam = req.nextUrl.searchParams.get("end");

  const start = startParam ? new Date(`${startParam}T00:00:00`) : fallback.start;
  const end = endParam ? new Date(`${endParam}T23:59:59.999`) : fallback.end;

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
    return fallback;
  }

  return { start, end };
}

function isInRange(isoDate: string | undefined, start: Date, end: Date) {
  if (!isoDate) return false;
  const ts = Date.parse(isoDate);
  if (!Number.isFinite(ts)) return false;
  return ts >= start.getTime() && ts <= end.getTime();
}

function hasEvent(lead: Lead, type: LeadEvent["type"], start: Date, end: Date) {
  return lead.events.some((event) => event.type === type && isInRange(event.ts, start, end));
}

function dateKeys(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

function signalSource(lead: Lead) {
  try {
    const parsed = JSON.parse(lead.signal);
    return parsed.source || parsed.signalSource || "keyword_search";
  } catch {
    return "keyword_search";
  }
}

export async function GET(req: NextRequest) {
  try {
    const $wsa = await requireAppWorkspaceRead(req);

    if (!$wsa.ok) return $wsa.response;

    const workspaceId = $wsa.value.workspaceId;
    const [campaigns, agents, allLeads] = await Promise.all([
      store.listCampaigns({ workspaceId }),
      store.listAgents(workspaceId),
      store.getAllLeads({ workspaceId }),
    ]);
    const { start, end } = parseRange(req);
    const periodDays = Math.max(1, Math.ceil((end.getTime() - start.getTime() + 1) / 86_400_000));

    const leadsCreated = allLeads.filter((lead) => isInRange(lead.createdAt, start, end));
    const invitedLeads = allLeads.filter((lead) => hasEvent(lead, "invite_sent", start, end));
    const acceptedLeads = allLeads.filter((lead) => hasEvent(lead, "accepted", start, end));
    const repliedLeads = allLeads.filter((lead) => hasEvent(lead, "replied", start, end));
    const activeSignals = agents.filter((agent: Agent) => agent.status === "active").length;

    const dailyMap = Object.fromEntries(
      dateKeys(start, end).map((key) => [key, { discovered: 0, invited: 0, accepted: 0, replied: 0, messaged: 0 }])
    ) as Record<string, { discovered: number; invited: number; accepted: number; replied: number; messaged: number }>;

    for (const lead of allLeads) {
      const createdDay = lead.createdAt.slice(0, 10);
      if (dailyMap[createdDay] && isInRange(lead.createdAt, start, end)) {
        dailyMap[createdDay].discovered++;
      }

      for (const event of lead.events) {
        if (!isInRange(event.ts, start, end)) continue;
        const eventDay = event.ts.slice(0, 10);
        if (!dailyMap[eventDay]) continue;
        if (event.type === "invite_sent") dailyMap[eventDay].invited++;
        if (event.type === "accepted") dailyMap[eventDay].accepted++;
        if (event.type === "replied") dailyMap[eventDay].replied++;
        if (event.type === "message_sent") dailyMap[eventDay].messaged++;
      }
    }

    const dailyPerformance = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({ date, ...stats }));

    const byAgent = agents.map((agent) => {
      const agentCampaignIds = new Set(campaigns.filter((campaign) => campaign.agentId === agent.id).map((campaign) => campaign.id));
      const leads = allLeads.filter((lead) => agentCampaignIds.has(lead.campaignId));
      const totalLeads = leads.filter((lead) => isInRange(lead.createdAt, start, end)).length;
      const invited = leads.filter((lead) => hasEvent(lead, "invite_sent", start, end)).length;
      const accepted = leads.filter((lead) => hasEvent(lead, "accepted", start, end)).length;
      const replied = leads.filter((lead) => hasEvent(lead, "replied", start, end)).length;

      return {
        agentName: agent.name,
        agentStatus: agent.status,
        totalLeads,
        invited,
        accepted,
        replied,
        connectRate: invited > 0 ? Math.round((accepted / invited) * 100) : 0,
        replyRate: accepted > 0 ? Math.round((replied / accepted) * 100) : 0,
      };
    });

    const byCampaign = campaigns.map((campaign: Campaign) => {
      const leads = allLeads.filter((lead) => lead.campaignId === campaign.id);
      const totalLeads = leads.filter((lead) => isInRange(lead.createdAt, start, end)).length;
      const sent = leads.filter((lead) => hasEvent(lead, "invite_sent", start, end)).length;
      const accepted = leads.filter((lead) => hasEvent(lead, "accepted", start, end)).length;
      const replied = leads.filter((lead) => hasEvent(lead, "replied", start, end)).length;

      return {
        campaignName: campaign.name,
        totalLeads,
        sent,
        accepted,
        replied,
        connectRate: sent > 0 ? Math.round((accepted / sent) * 100) : 0,
        replyRate: accepted > 0 ? Math.round((replied / accepted) * 100) : 0,
      };
    });

    const signalMap: Record<string, { signal: string; type: string; leadsGenerated: number }> = {};
    for (const lead of leadsCreated) {
      const source = signalSource(lead);
      signalMap[source] = signalMap[source] || {
        signal: source,
        type: source,
        leadsGenerated: 0,
      };
      signalMap[source].leadsGenerated++;
    }

    const bySignal = Object.values(signalMap).sort((a, b) => b.leadsGenerated - a.leadsGenerated);

    return NextResponse.json({
      period: {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      },
      kpis: {
        totalLeads: leadsCreated.length,
        avgLeadsPerDay: Math.round(leadsCreated.length / periodDays),
        activeSignals,
        totalInvited: invitedLeads.length,
        totalAccepted: acceptedLeads.length,
        totalReplied: repliedLeads.length,
        connectRate: invitedLeads.length > 0 ? Math.round((acceptedLeads.length / invitedLeads.length) * 100) : 0,
        replyRate: acceptedLeads.length > 0 ? Math.round((repliedLeads.length / acceptedLeads.length) * 100) : 0,
      },
      dailyPerformance,
      byAgent,
      byCampaign,
      bySignal,
    });
  } catch (error) {
    console.error("Insights API error:", error);
    return NextResponse.json({
      period: { start: "", end: "" },
      kpis: {
        totalLeads: 0,
        avgLeadsPerDay: 0,
        activeSignals: 0,
        totalInvited: 0,
        totalAccepted: 0,
        totalReplied: 0,
        connectRate: 0,
        replyRate: 0,
      },
      dailyPerformance: [],
      byAgent: [],
      byCampaign: [],
      bySignal: [],
    });
  }
}
