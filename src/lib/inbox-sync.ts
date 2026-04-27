/**
 * BrandMultiplier GTM — Inbox Sync
 *
 * Checks LinkedIn chats for new replies from leads and updates their status.
 * Designed to run in the daily cron alongside the sequence runner.
 */

import { getChat, getChatMessages, getOrCreateChat, listChats, sendMessage, type UnipileClientOptions } from "./unipile";
import * as store from "./store";
import type { Campaign, Lead } from "./types";
import {
  consumeSeatQuota,
  resolveWorkspaceLinkedInClientConfig,
  persistNormalizedSeat,
  resolveLinkedInSeatForCampaign,
  seatQuotaUsage,
} from "./linkedin-seats";
import { reconcileSequenceProgressFromEvents } from "./sequence-progress";

export interface InboxSyncResult {
  checked: number;
  newReplies: InboxReply[];
  errors: string[];
}

export interface InboxReply {
  leadId: string;
  leadName: string;
  campaignId: string;
  chatId: string;
  message: string;
  receivedAt: string;
  needsResponse: boolean;
}

interface ChatItem {
  id: string;
  attendee_provider_id?: string;
  attendees?: Array<{ provider_id?: string; id?: string; display_name?: string; name?: string }>;
  [key: string]: unknown;
}

interface MessageItem {
  sender_id?: string;
  is_sender?: boolean | number;
  text?: string;
  body?: string;
  timestamp?: string;
  created_at?: string;
  date?: string;
  [key: string]: unknown;
}

function normalizeMessageText(text: string | undefined): string {
  return (text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function messageTimestamp(message: MessageItem): string {
  return message.timestamp || message.created_at || message.date || new Date().toISOString();
}

function isFromLeadMessage(message: MessageItem, lead: Lead): boolean {
  const senderId = message.sender_id || "";
  return message.is_sender === false || message.is_sender === 0
    ? true
    : message.is_sender === true || message.is_sender === 1
      ? false
      : senderId === lead.providerId;
}

function hasMatchingOutboundEvent(lead: Lead, content: string, timestamp: string): boolean {
  const normalized = normalizeMessageText(content);
  const targetTs = Date.parse(timestamp);

  return (lead.events || []).some((event) => {
    if (!["message_sent", "invite_sent"].includes(event.type) || !event.message) return false;
    if (normalizeMessageText(event.message) !== normalized) return false;

    if (event.type === "invite_sent") {
      // Providers can replay the original connection note inside chat history hours later.
      // Treat identical content as already accounted for regardless of timestamp drift.
      return true;
    }

    const eventTs = Date.parse(event.ts);
    if (!Number.isFinite(targetTs) || !Number.isFinite(eventTs)) return true;
    return Math.abs(eventTs - targetTs) <= 5 * 60 * 1000;
  });
}

async function syncOutboundMessagesFromChat(
  lead: Lead,
  campaign: Campaign | null,
  messages: MessageItem[]
): Promise<Lead> {
  if (!campaign || messages.length === 0) return lead;

  let mutated = false;

  for (const message of [...messages].sort((a, b) => Date.parse(messageTimestamp(a)) - Date.parse(messageTimestamp(b)))) {
    if (isFromLeadMessage(message, lead)) continue;

    const content = message.text || message.body || "";
    if (!content.trim()) continue;

    const timestamp = messageTimestamp(message);
    if (hasMatchingOutboundEvent(lead, content, timestamp)) continue;

    lead.events.push({
      ts: timestamp,
      type: "message_sent",
      message: content,
    });
    mutated = true;
  }

  if (!mutated) return lead;

  const reconciled = reconcileSequenceProgressFromEvents(lead, campaign);
  return await store.saveLead(reconciled.lead);
}

async function processLeadChatMessages(
  lead: Lead,
  campaign: Campaign | null,
  chatId: string,
  messages: MessageItem[],
  newReplies: InboxReply[]
): Promise<Lead> {
  if (messages.length === 0) return lead;

  let nextLead = await syncOutboundMessagesFromChat(lead, campaign, messages);

  const [latestMsg] = [...messages].sort((a, b) => {
    const tsA = Date.parse(messageTimestamp(a));
    const tsB = Date.parse(messageTimestamp(b));
    return tsB - tsA;
  });

  if (!isFromLeadMessage(latestMsg, nextLead)) {
    return nextLead;
  }

  const messageText = latestMsg.text || latestMsg.body || "";
  const msgTime = messageTimestamp(latestMsg);
  const lastReplyEvent = [...nextLead.events].reverse().find((event) => event.type === "replied");
  if (lastReplyEvent && lastReplyEvent.message === messageText) {
    return nextLead;
  }

  const needsResponse = nextLead.status !== "interested" && nextLead.status !== "not_interested";

  if (nextLead.status !== "replied" && nextLead.status !== "interested") {
    nextLead.status = "replied";
    nextLead.events.push({
      ts: new Date().toISOString(),
      type: "replied",
      message: messageText,
    });
    nextLead = await store.saveLead(nextLead);
  }

  newReplies.push({
    leadId: nextLead.id,
    leadName: nextLead.name,
    campaignId: nextLead.campaignId,
    chatId,
    message: messageText,
    receivedAt: msgTime,
    needsResponse,
  });

  return nextLead;
}

async function fetchChatMessages(chatId: string, client?: UnipileClientOptions, limit = 5): Promise<MessageItem[]> {
  const body = await getChatMessages(chatId, limit, client);
  return (body.items || body.data || []) as MessageItem[];
}

async function fetchChatDetail(chatId: string, client?: UnipileClientOptions): Promise<ChatItem> {
  return (await getChat(chatId, client)) as ChatItem;
}

export async function syncInbox(workspaceId?: string): Promise<InboxSyncResult> {
  const errors: string[] = [];
  const newReplies: InboxReply[] = [];
  const campaigns = await store.listCampaigns({ workspaceId });
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));

  // Get all leads that we've contacted (invite_sent, accepted, message_sent)
  const allLeads = await store.getAllLeads({ workspaceId });
  const activeLeads = allLeads.filter((l) =>
    ["invite_sent", "accepted", "message_sent", "replied"].includes(l.status)
  );

  if (activeLeads.length === 0) {
    return { checked: 0, newReplies: [], errors: [] };
  }

  // Build providerId -> lead map
  const leadByProvider = new Map(activeLeads.map((l) => [l.providerId, l]));
  const workspace = workspaceId ? await store.getWorkspace(workspaceId) : null;
  const seats = await store.listLinkedInSeats(workspaceId);
  const seatIdByCampaignId = new Map<string, string>();
  for (const campaign of campaigns) {
    const seat = await resolveLinkedInSeatForCampaign(campaign, campaign.workspaceId);
    if (seat) {
      seatIdByCampaignId.set(campaign.id, seat.id);
    }
  }
  let checked = 0;

  for (const seat of seats) {
    const clientConfig = await resolveWorkspaceLinkedInClientConfig(workspace, seat);
    const processedLeadIds = new Set<string>();
    const seatLeads = activeLeads.filter((lead) => seatIdByCampaignId.get(lead.campaignId) === seat.id);

    for (const lead of seatLeads.filter((item) => item.unipileChatId)) {
      let messages: MessageItem[];
      try {
        messages = await fetchChatMessages(lead.unipileChatId!, clientConfig, 10);
      } catch {
        continue;
      }

      if (messages.length === 0) continue;

      checked++;
      const updatedLead = await processLeadChatMessages(
        lead,
        campaignById.get(lead.campaignId) || null,
        lead.unipileChatId!,
        messages,
        newReplies
      );
      leadByProvider.set(updatedLead.providerId, updatedLead);
      processedLeadIds.add(updatedLead.id);
    }

    let chatsRes;
    try {
      chatsRes = await listChats(clientConfig);
    } catch (err) {
      errors.push(`Failed to fetch chats for ${seat.name}: ${err}`);
      continue;
    }

    const chats = (chatsRes?.items || chatsRes?.data || chatsRes || []) as ChatItem[];

    for (const chat of chats.slice(0, 30)) {
      let matchedLead = typeof chat.attendee_provider_id === "string"
        ? leadByProvider.get(chat.attendee_provider_id) || null
        : null;

      // Get chat detail to find attendees
      if (!matchedLead) {
        let detail: ChatItem;
        try {
          detail = await fetchChatDetail(chat.id, clientConfig);
        } catch {
          continue;
        }

        if (typeof detail.attendee_provider_id === "string") {
          matchedLead = leadByProvider.get(detail.attendee_provider_id) || null;
        }

        if (!matchedLead) {
          const attendees = detail.attendees || [];
          for (const att of attendees) {
            const pid = att.provider_id || att.id || "";
            if (leadByProvider.has(pid)) {
              matchedLead = leadByProvider.get(pid)!;
              break;
            }
          }
        }
      }

      if (!matchedLead || processedLeadIds.has(matchedLead.id)) continue;
      checked++;
      if (matchedLead.unipileChatId !== chat.id) {
        matchedLead.unipileChatId = chat.id;
        await store.saveLead(matchedLead);
      }

      // Get recent messages
      let messages: MessageItem[];
      try {
        messages = await fetchChatMessages(chat.id, clientConfig, 10);
      } catch {
        continue;
      }

      if (messages.length === 0) continue;

      const updatedLead = await processLeadChatMessages(
        matchedLead,
        campaignById.get(matchedLead.campaignId) || null,
        chat.id,
        messages,
        newReplies
      );
      leadByProvider.set(updatedLead.providerId, updatedLead);
      processedLeadIds.add(updatedLead.id);
    }
  }

  return { checked, newReplies, errors };
}

/** Send a reply to a lead's LinkedIn chat */
export async function replyToLead(
  leadId: string,
  campaignId: string,
  chatId: string | null | undefined,
  message: string,
  workspaceId?: string
): Promise<{ success: boolean; error?: string; chatId?: string }> {
  try {
    const lead = await store.getLead(campaignId, leadId, workspaceId);
    const campaign = await store.getCampaign(campaignId, workspaceId);
    const workspace = campaign ? await store.getWorkspace(campaign.workspaceId) : null;
    let seat = campaign ? await resolveLinkedInSeatForCampaign(campaign, workspaceId || campaign.workspaceId) : null;
    if (seat) {
      seat = await persistNormalizedSeat(seat);
    }
    const clientConfig = await resolveWorkspaceLinkedInClientConfig(workspace, seat);
    const resolvedChatId = chatId || lead?.unipileChatId || (lead ? await getOrCreateChat(lead.providerId, clientConfig) : null);

    if (!resolvedChatId) {
      return { success: false, error: "Chat not found" };
    }

    if (seat) {
      const messageQuota = seatQuotaUsage(seat, "messages");
      if (messageQuota.remaining <= 0) {
        return { success: false, error: `Message quota reached on seat ${seat.name}` };
      }
    }

    const result = await sendMessage(resolvedChatId, message, clientConfig);
    const httpStatus = result._httpStatus || result.status;
    const isError =
      (typeof httpStatus === "number" && httpStatus >= 400) ||
      (result.type && typeof result.type === "string" && result.type.startsWith("errors/"));

    if (isError) {
      return { success: false, error: result.detail || result.title || "Send failed" };
    }

    if (lead) {
      const sentAt = new Date().toISOString();
      lead.unipileChatId = resolvedChatId;
      lead.events.push({
        ts: sentAt,
        type: "message_sent",
        message,
      });
      const reconciled = campaign ? reconcileSequenceProgressFromEvents(lead, campaign) : { lead, changed: true };
      await store.saveLead(reconciled.lead);
    }

    if (seat) {
      await consumeSeatQuota(seat, "messages", 1, new Date());
    }

    return { success: true, chatId: resolvedChatId };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
