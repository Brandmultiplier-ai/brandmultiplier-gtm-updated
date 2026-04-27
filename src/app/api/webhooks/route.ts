import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import { hasSharedSecret } from "@/lib/security";
import { getUnauthenticatedWorkspaceId } from "@/lib/workspace-context";
import { findProviderConnectionByUnipileAccountId } from "@/lib/provider-connections";

function getEventType(event: Record<string, unknown>): string {
  const raw = [event.event, event.type, event.webhook_name]
    .find((value) => typeof value === "string" && value.trim().length > 0);
  return typeof raw === "string" ? raw.trim() : "";
}

function getOwnProviderId(event: Record<string, unknown>): string {
  const accountInfo = event.account_info;
  if (accountInfo && typeof accountInfo === "object") {
    const nested = accountInfo as Record<string, unknown>;
    if (typeof nested.user_id === "string") return nested.user_id;
    if (typeof nested.provider_id === "string") return nested.provider_id;
  }
  return typeof event.account_id === "string" ? event.account_id : "";
}

function getLeadProviderId(event: Record<string, unknown>): string {
  if (typeof event.user_provider_id === "string") return event.user_provider_id;
  if (typeof event.provider_id === "string") return event.provider_id;
  if (typeof event.user_id === "string") return event.user_id;

  const sender = event.sender;
  if (sender && typeof sender === "object") {
    const nested = sender as Record<string, unknown>;
    if (typeof nested.attendee_provider_id === "string") return nested.attendee_provider_id;
    if (typeof nested.provider_id === "string") return nested.provider_id;
    if (typeof nested.id === "string") return nested.id;
  }

  const attendees = event.attendees;
  if (Array.isArray(attendees)) {
    const ownProviderId = getOwnProviderId(event);
    for (const attendee of attendees) {
      if (!attendee || typeof attendee !== "object") continue;
      const nested = attendee as Record<string, unknown>;
      const candidate = typeof nested.attendee_provider_id === "string"
        ? nested.attendee_provider_id
        : typeof nested.provider_id === "string"
          ? nested.provider_id
          : typeof nested.id === "string"
            ? nested.id
            : "";
      if (candidate && candidate !== ownProviderId) {
        return candidate;
      }
    }
  }

  return "";
}

function isInboundMessage(event: Record<string, unknown>): boolean {
  const raw = event.is_sender;
  if (typeof raw === "boolean") return !raw;
  if (typeof raw === "number") return raw === 0;
  if (typeof raw === "string") {
    const normalized = raw.toLowerCase();
    if (normalized === "true" || normalized === "1") return false;
    if (normalized === "false" || normalized === "0") return true;
  }

  const sender = event.sender;
  if (sender && typeof sender === "object") {
    const nested = sender as Record<string, unknown>;
    const ownProviderId = getOwnProviderId(event);
    const senderProviderId = typeof nested.attendee_provider_id === "string"
      ? nested.attendee_provider_id
      : typeof nested.provider_id === "string"
        ? nested.provider_id
        : "";
    if (senderProviderId && ownProviderId) {
      return senderProviderId !== ownProviderId;
    }
  }

  return true;
}

function getMessageText(event: Record<string, unknown>): string {
  if (typeof event.text === "string") return event.text;
  if (typeof event.message === "string") return event.message;
  if (event.message && typeof event.message === "object") {
    const nested = event.message as Record<string, unknown>;
    if (typeof nested.text === "string") return nested.text;
    if (typeof nested.body === "string") return nested.body;
    if (typeof nested.message === "string") return nested.message;
  }
  return "";
}

export async function POST(req: NextRequest) {
  if (!hasSharedSecret(req, process.env.BM_GTM_WEBHOOK_SECRET, {
    headerNames: ["unipile-auth", "x-bm-webhook-secret"],
    queryNames: ["secret"],
  })) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const event = await req.json() as Record<string, unknown>;
  const ts = new Date().toISOString();
  const accountId = typeof event.account_id === "string" ? event.account_id.trim() : "";
  const fromConnection = accountId
    ? await findProviderConnectionByUnipileAccountId(accountId)
    : null;
  const allowDefault = process.env.NODE_ENV !== "production";
  let workspaceId =
    fromConnection?.workspaceId
    || getUnauthenticatedWorkspaceId(req, { allowDefault })
    || "";
  if (!workspaceId) {
    return NextResponse.json(
      { ok: false, error: "Cannot resolve workspace for webhook (set Unipile account on provider connection)" },
      { status: 400 },
    );
  }
  const eventType = getEventType(event);
  let campaignId: string | undefined;
  let leadId: string | undefined;

  // Correlate to lead if possible
  const providerId = getLeadProviderId(event);
  if (providerId) {
    const ref = await store.lookupByProviderId(providerId, workspaceId);
    if (ref) {
      campaignId = ref.campaignId;
      leadId = ref.leadId;
      const lead = await store.getLead(ref.campaignId, ref.leadId);
      if (lead) {
        workspaceId = lead.workspaceId;

        if (
          eventType === "connection_accepted" ||
          eventType === "invitation_accepted" ||
          eventType === "new_relation"
        ) {
          lead.status = "accepted";
          lead.events.push({ ts, type: "accepted" });
          await store.saveLead(lead);
        } else if (
          (eventType === "message_received" || eventType === "new_message") &&
          isInboundMessage(event)
        ) {
          lead.status = "replied";
          if (typeof event.chat_id === "string" && event.chat_id.trim()) {
            lead.unipileChatId = event.chat_id;
          }
          lead.events.push({ ts, type: "replied", message: getMessageText(event) });
          await store.saveLead(lead);
        }
      }
    }
  }

  await store.saveWebhookEvent({
    workspaceId,
    ts,
    eventType,
    providerId: providerId || undefined,
    campaignId,
    leadId,
    payload: event,
  });

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  if (!hasSharedSecret(req, process.env.BM_GTM_WEBHOOK_SECRET, {
    headerNames: ["unipile-auth", "x-bm-webhook-secret"],
    queryNames: ["secret"],
  })) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const workspaceId = getUnauthenticatedWorkspaceId(req, { allowDefault: true });
  const events = await store.listWebhookEvents(workspaceId, 50);

  return NextResponse.json({ events });
}
