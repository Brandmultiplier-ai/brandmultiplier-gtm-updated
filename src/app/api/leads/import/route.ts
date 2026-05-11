import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import type { Campaign, Lead, LeadStatus } from "@/lib/types";
import { normalizeLinkedInProfileRef } from "@/lib/profile-targeting";
import { requireAppWorkspaceWrite } from "@/lib/auth/resolve-app-workspace";

type ImportDefaults = {
  segment?: string;
  language?: "en" | "it";
  signal?: string;
  status?: LeadStatus;
};

type ImportBody = {
  campaignId?: string;
  rows?: Array<Record<string, unknown>>;
  mappings?: Record<string, string>;
  defaults?: ImportDefaults;
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseLanguage(value: string, fallback: "en" | "it"): "en" | "it" {
  const normalized = value.trim().toLowerCase();
  if (normalized === "it" || normalized.startsWith("ita")) return "it";
  if (normalized === "en" || normalized.startsWith("eng")) return "en";
  return fallback;
}

function parsePublicIdentifierFromUrl(value: string): string {
  const match = value.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!match?.[1]) return "";
  return normalizeLinkedInProfileRef(match[1]);
}

function resolveCampaignLanguage(campaign: Campaign): "en" | "it" {
  return campaign.search.language === "it" ? "it" : "en";
}

function resolveCampaignStatus(defaults?: ImportDefaults): LeadStatus {
  if (!defaults?.status) return "new";
  if (defaults.status === "new" || defaults.status === "discovered") return defaults.status;
  return "new";
}

function readMappedValue(
  row: Record<string, unknown>,
  mappings: Record<string, string>,
  field: string,
): string {
  const column = normalizeString(mappings[field]);
  if (!column) return "";
  return normalizeString(row[column]);
}

export async function POST(req: NextRequest) {
  try {
    const $wsa = await requireAppWorkspaceWrite(req);
    if (!$wsa.ok) return $wsa.response;

    const workspaceId = $wsa.value.workspaceId;
    const body = (await req.json().catch(() => ({}))) as ImportBody;
    const mappings = body.mappings || {};
    const rows = Array.isArray(body.rows) ? body.rows : [];

    if (rows.length === 0) {
      return NextResponse.json({ error: "rows array is required" }, { status: 400 });
    }

    const campaigns = await store.listCampaigns({ workspaceId });
    if (campaigns.length === 0) {
      return NextResponse.json({ error: "No campaigns found in workspace" }, { status: 400 });
    }

    const campaign = body.campaignId
      ? await store.getCampaign(body.campaignId, workspaceId)
      : campaigns.find((item) => item.status === "active") || campaigns[0];
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found in workspace" }, { status: 404 });
    }

    const defaults = body.defaults || {};
    const fallbackLanguage = defaults.language || resolveCampaignLanguage(campaign);
    const fallbackSegment = defaults.segment || campaign.segment || "imported";
    const fallbackSignal = defaults.signal || "Imported from CSV";
    const fallbackStatus = resolveCampaignStatus(defaults);

    let imported = 0;
    let duplicate = 0;
    let invalid = 0;
    const errors: Array<{ row: number; reason: string }> = [];

    for (let index = 0; index < rows.length; index += 1) {
      const rawRow = rows[index];
      if (!rawRow || typeof rawRow !== "object") {
        invalid += 1;
        errors.push({ row: index + 1, reason: "Row is not an object" });
        continue;
      }

      const row = rawRow as Record<string, unknown>;
      const mappedProviderId = readMappedValue(row, mappings, "providerId");
      const mappedPublicIdentifier = readMappedValue(row, mappings, "publicIdentifier");
      const mappedProfileUrl = readMappedValue(row, mappings, "profileUrl");
      const mappedName = readMappedValue(row, mappings, "name");
      const mappedLanguage = readMappedValue(row, mappings, "language");

      const publicIdentifierFromUrl = parsePublicIdentifierFromUrl(mappedProfileUrl);
      const normalizedPublicIdentifier = normalizeLinkedInProfileRef(
        mappedPublicIdentifier || publicIdentifierFromUrl || mappedProviderId,
      );
      const providerId = normalizeLinkedInProfileRef(mappedProviderId || normalizedPublicIdentifier);

      if (!providerId) {
        invalid += 1;
        errors.push({
          row: index + 1,
          reason: "Missing providerId/publicIdentifier/profileUrl mapping value",
        });
        continue;
      }

      if (await store.isProviderIdUsed(providerId, workspaceId)) {
        duplicate += 1;
        continue;
      }

      const fallbackName = normalizedPublicIdentifier
        ? normalizedPublicIdentifier.replace(/[-_]+/g, " ")
        : `Imported Lead ${index + 1}`;

      const lead: Lead = {
        id: "",
        workspaceId,
        campaignId: campaign.id,
        providerId,
        name: mappedName || fallbackName,
        headline: readMappedValue(row, mappings, "headline"),
        company: readMappedValue(row, mappings, "company"),
        location: readMappedValue(row, mappings, "location"),
        publicIdentifier: normalizedPublicIdentifier || providerId,
        networkDistance: readMappedValue(row, mappings, "networkDistance") || "DISTANCE_2",
        segment: readMappedValue(row, mappings, "segment") || fallbackSegment,
        language: parseLanguage(mappedLanguage, fallbackLanguage),
        aiScore: 1,
        signal: readMappedValue(row, mappings, "signal") || fallbackSignal,
        status: fallbackStatus,
        currentStep: 0,
        events: [
          {
            ts: new Date().toISOString(),
            type: "discovered",
            message: "Imported from CSV",
          },
        ],
        createdAt: "",
        updatedAt: "",
      };

      await store.saveLead(lead);
      imported += 1;
    }

    return NextResponse.json({
      ok: true,
      campaignId: campaign.id,
      imported,
      duplicate,
      invalid,
      total: rows.length,
      errors: errors.slice(0, 25),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to import CSV leads",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
