import { NextRequest, NextResponse } from "next/server";
import { listAllRelations } from "@/lib/unipile";
import * as store from "@/lib/store";
import type { Campaign, Lead } from "@/lib/types";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";

/**
 * GET /api/sync — Preview relations from Unipile (dry run)
 * POST /api/sync — Import relations as leads into the store
 *
 * Body (POST): { campaignId: string, segment?: string }
 */

export async function GET() {
  try {
    const relations = await listAllRelations(3);
    return NextResponse.json({
      count: relations.length,
      relations,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Failed to fetch relations", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const $wsa = await requireAppWorkspaceRead(req);

    if (!$wsa.ok) return $wsa.response;

    const workspaceId = $wsa.value.workspaceId;
    const { campaignId, segment = "imported" } = await req.json().catch(() => ({}));

    if (!campaignId) {
      // Default: first active campaign
      const campaigns = await store.listCampaigns({ workspaceId });
      const active = campaigns.find((c) => c.status === "active") || campaigns[0];
      if (!active) {
        return NextResponse.json({ error: "No campaign found" }, { status: 400 });
      }
      return importRelations(active, active.segment || segment);
    }

    const campaign = await store.getCampaign(campaignId, workspaceId);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found in workspace" }, { status: 404 });
    }

    return importRelations(campaign, campaign.segment || segment);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Import failed", detail: String(err) },
      { status: 500 }
    );
  }
}

async function importRelations(campaign: Campaign, segment: string) {
  const relations = await listAllRelations(3);
  let imported = 0;
  let skipped = 0;

  for (const rel of relations as Record<string, unknown>[]) {
    const providerId = (rel.member_id || rel.provider_id || rel.id || "") as string;
    if (!providerId) {
      skipped++;
      continue;
    }

    // Skip if already in store
    if (await store.isProviderIdUsed(providerId, campaign.workspaceId)) {
      skipped++;
      continue;
    }

    const firstName = (rel.first_name || "") as string;
    const lastName = (rel.last_name || "") as string;
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || (rel.name as string) || "";

    const lead: Lead = {
      id: "",
      workspaceId: campaign.workspaceId,
      campaignId: campaign.id,
      providerId,
      name: fullName,
      headline: (rel.headline || "") as string,
      company: (rel.company || "") as string,
      location: (rel.location || "") as string,
      publicIdentifier: (rel.public_identifier || "") as string,
      networkDistance: "DISTANCE_1", // already connected
      segment,
      language: detectLangFromName(fullName, (rel.location || "") as string),
      aiScore: 1,
      signal: "Imported from Unipile relations",
      status: "accepted", // they're already connections
      currentStep: 1,
      events: [
        {
          ts: new Date().toISOString(),
          type: "accepted",
          message: "Imported from Unipile — already connected",
        },
      ],
      createdAt: "",
      updatedAt: "",
    };

    await store.saveLead(lead);
    imported++;
  }

  return NextResponse.json({
    imported,
    skipped,
    total: relations.length,
    campaignId: campaign.id,
  });
}

function detectLangFromName(name: string, location: string): "it" | "en" {
  const loc = location.toLowerCase();
  const itLocations = [
    "italy", "italia", "milan", "rome", "turin", "naples", "florence",
    "bologna", "venice", "palermo", "bari", "verona", "padova",
  ];
  if (itLocations.some((it) => loc.includes(it))) return "it";

  const lastName = name.split(" ").slice(-1)[0]?.toLowerCase() || "";
  const italianSuffixes = ["ini", "oni", "elli", "etti", "ucci", "ino", "ina", "ano", "ato", "aro", "oro"];
  if (italianSuffixes.some((s) => lastName.endsWith(s))) return "it";

  return "en";
}
