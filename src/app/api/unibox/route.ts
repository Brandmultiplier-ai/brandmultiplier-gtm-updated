import { NextRequest, NextResponse } from "next/server";
import { getWorkspace, listCampaigns, listLeads, listLinkedInSeats, saveLead } from "@/lib/store";
import type { Lead, Campaign } from "@/lib/types";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";
import { ensureLeadCompanyData, getLeadCompanySnapshot } from "@/lib/lead-enrichment";
import { getChat, getChatMessages, listChats } from "@/lib/unipile";
import { resolveWorkspaceLinkedInClientConfig, resolveLinkedInSeatForCampaign } from "@/lib/linkedin-seats";

export const dynamic = "force-dynamic";

interface ChatAttendee {
  attendee_provider_id?: string;
  provider_id?: string;
  id?: string;
  [key: string]: unknown;
}

interface ChatSummary {
  id: string;
  attendee_provider_id?: string;
  attendees?: ChatAttendee[];
  [key: string]: unknown;
}

interface ChatMessage {
  id?: string;
  sender_id?: string;
  is_sender?: boolean | number;
  text?: string;
  body?: string;
  message?: string;
  timestamp?: string;
  created_at?: string;
  date?: string;
  [key: string]: unknown;
}

interface ConversationMessage {
  id: string;
  sender: "me" | "them";
  content: string;
  timestamp: string;
}

interface ConversationRecord {
  leadId: string;
  campaignId: string;
  chatId: string | null;
  name: string;
  headline: string;
  company: string;
  companyName: string;
  companySize: string;
  industry: string;
  companyDescription: string;
  companyLinkedInUrl: string;
  location: string;
  profilePictureUrl?: string;
  publicIdentifier: string;
  aiScore: number;
  signal: string;
  signalSource: string;
  status: string;
  lastMessage: string;
  lastMessageAt: string;
  messages: ConversationMessage[];
  isHydrated: boolean;
}

function parseSignal(lead: Lead) {
  let signalSource = "keyword_search";
  let signalText = "";

  try {
    const sig = JSON.parse(lead.signal);
    signalSource = sig.source || sig.signalSource || "keyword_search";
    signalText = sig.context || sig.signalContext || sig.scoreReasoning || "";
  } catch {
    signalText = lead.signal || "";
  }

  return { signalSource, signalText };
}

function shouldIncludeLead(lead: Lead) {
  const hasMessages = lead.events.some(
    (event) => event.type === "message_sent" || event.type === "replied" || event.type === "invite_sent"
  );

  return (
    hasMessages ||
    lead.status === "accepted" ||
    lead.status === "message_sent" ||
    lead.status === "replied" ||
    lead.status === "interested"
  );
}

function buildFallbackMessages(lead: Lead, campaign: Campaign): ConversationMessage[] {
  const messages: ConversationMessage[] = [];

  for (const event of lead.events) {
    if (event.type === "invite_sent" && event.message) {
      messages.push({
        id: `${lead.id}-${event.ts}-inv`,
        sender: "me",
        content: event.message,
        timestamp: event.ts,
      });
    }
    if (event.type === "message_sent" && event.message) {
      messages.push({
        id: `${lead.id}-${event.ts}-msg`,
        sender: "me",
        content: event.message,
        timestamp: event.ts,
      });
    }
    if (event.type === "replied" && event.message) {
      messages.push({
        id: `${lead.id}-${event.ts}-reply`,
        sender: "them",
        content: event.message,
        timestamp: event.ts,
      });
    }
  }

  if (messages.length === 0) {
    const firstStep = campaign.sequence.find((step) => step.step === 1);
    if (firstStep?.content && (lead.status === "accepted" || lead.status === "invite_sent")) {
      messages.push({
        id: `${lead.id}-step1`,
        sender: "me",
        content: firstStep.content,
        timestamp: lead.createdAt,
      });
    }
  }

  return messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

async function buildChatIdMap(providerIds: string[], workspaceId: string) {
  const providerSet = new Set(providerIds);
  const chatIdByProvider = new Map<string, string>();
  const workspace = await getWorkspace(workspaceId);
  const seats = await listLinkedInSeats(workspaceId);

  for (const seat of seats) {
    try {
      const chatsRes = await listChats(await resolveWorkspaceLinkedInClientConfig(workspace, seat));
      const chats = (chatsRes?.items || chatsRes?.data || chatsRes || []) as ChatSummary[];

      for (const chat of chats) {
        if (!chat?.id) continue;

        if (typeof chat.attendee_provider_id === "string" && providerSet.has(chat.attendee_provider_id)) {
          chatIdByProvider.set(chat.attendee_provider_id, chat.id);
          continue;
        }

        const attendees = Array.isArray(chat.attendees) ? chat.attendees : [];
        for (const attendee of attendees) {
          const providerId = typeof attendee.attendee_provider_id === "string"
            ? attendee.attendee_provider_id
            : typeof attendee.provider_id === "string"
              ? attendee.provider_id
              : typeof attendee.id === "string"
                ? attendee.id
                : "";

          if (providerId && providerSet.has(providerId) && !chatIdByProvider.has(providerId)) {
            chatIdByProvider.set(providerId, chat.id);
          }
        }
      }
    } catch {
      continue;
    }
  }

  return chatIdByProvider;
}

async function fetchLiveMessages(chatId: string, lead: Lead, campaign: Campaign) {
  try {
    const workspace = await getWorkspace(campaign.workspaceId);
    const seat = await resolveLinkedInSeatForCampaign(campaign, campaign.workspaceId);
    const messagesRes = await getChatMessages(chatId, 50, await resolveWorkspaceLinkedInClientConfig(workspace, seat));
    const messages = (messagesRes?.items || messagesRes?.data || []) as ChatMessage[];

    return messages
      .map((message, index) => ({
        id: typeof message.id === "string" ? message.id : `${chatId}-${index}`,
        sender:
          message.is_sender === true || message.is_sender === 1
            ? "me" as const
            : message.is_sender === false || message.is_sender === 0
              ? "them" as const
              : message.sender_id === lead.providerId
                ? "them" as const
                : "me" as const,
        content: typeof message.text === "string"
          ? message.text
          : typeof message.body === "string"
            ? message.body
            : typeof message.message === "string"
              ? message.message
              : "",
        timestamp: typeof message.timestamp === "string"
          ? message.timestamp
          : typeof message.created_at === "string"
            ? message.created_at
            : typeof message.date === "string"
              ? message.date
              : lead.updatedAt,
      }))
      .filter((message) => message.content.trim().length > 0)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  } catch {
    return [];
  }
}

async function listConversationEntries(workspaceId: string) {
  const campaigns = await listCampaigns({ workspaceId });
  const leadGroups = await Promise.all(
    campaigns.map(async (campaign) => ({
      campaign,
      leads: await listLeads(campaign.id, { workspaceId }),
    }))
  );

  return leadGroups.flatMap(({ campaign, leads }) =>
    leads
      .filter((lead) => shouldIncludeLead(lead))
      .map((lead) => ({ campaign, lead }))
  );
}

function buildConversationBase(lead: Lead, campaign: Campaign) {
  const { signalSource, signalText } = parseSignal(lead);
  const company = getLeadCompanySnapshot(lead);

  return {
    leadId: lead.id,
    campaignId: campaign.id,
    chatId: lead.unipileChatId || null,
    name: lead.name,
    headline: lead.headline,
    company: company.companyName,
    companyName: company.companyName,
    companySize: company.companySize,
    industry: company.industry,
    companyDescription: company.companyDescription,
    companyLinkedInUrl: company.companyLinkedInUrl,
    location: lead.location || "",
    profilePictureUrl: lead.profilePictureUrl,
    publicIdentifier: lead.publicIdentifier,
    aiScore: lead.aiScore || 0,
    signal: signalText,
    signalSource,
    status: lead.status,
  };
}

function buildConversationSummary(lead: Lead, campaign: Campaign): ConversationRecord | null {
  const fallbackMessages = buildFallbackMessages(lead, campaign);
  if (fallbackMessages.length === 0) return null;

  const lastMsg = fallbackMessages[fallbackMessages.length - 1];

  return {
    ...buildConversationBase(lead, campaign),
    lastMessage: lastMsg.content.substring(0, 80),
    lastMessageAt: lastMsg.timestamp,
    messages: [],
    isHydrated: false,
  };
}

async function hydrateConversation(lead: Lead, campaign: Campaign): Promise<ConversationRecord | null> {
  const workspace = await getWorkspace(campaign.workspaceId);
  const seat = await resolveLinkedInSeatForCampaign(campaign, campaign.workspaceId);
  const clientConfig = await resolveWorkspaceLinkedInClientConfig(workspace, seat);
  const enrichedLead = await ensureLeadCompanyData(lead, clientConfig);

  let chatId = enrichedLead.unipileChatId || null;
  if (!chatId && enrichedLead.providerId) {
    const chatIdByProvider = await buildChatIdMap([enrichedLead.providerId], campaign.workspaceId);
    chatId = chatIdByProvider.get(enrichedLead.providerId) || null;
    if (chatId) {
      enrichedLead.unipileChatId = chatId;
      await saveLead(enrichedLead);
    }
  }

  if (!chatId && typeof enrichedLead.unipileChatId === "string" && enrichedLead.unipileChatId.trim()) {
    chatId = enrichedLead.unipileChatId;
  }

  if (chatId && !enrichedLead.unipileChatId) {
    try {
      const detail = await getChat(chatId, clientConfig);
      if (detail?.id === chatId) {
        enrichedLead.unipileChatId = chatId;
        await saveLead(enrichedLead);
      }
    } catch {
      // Keep best-effort only.
    }
  }

  const liveMessages = chatId ? await fetchLiveMessages(chatId, enrichedLead, campaign) : [];
  const messages = liveMessages.length > 0 ? liveMessages : buildFallbackMessages(enrichedLead, campaign);
  if (messages.length === 0) return null;

  const lastMsg = messages[messages.length - 1];

  return {
    ...buildConversationBase(enrichedLead, campaign),
    chatId,
    lastMessage: lastMsg.content.substring(0, 80),
    lastMessageAt: lastMsg.timestamp,
    messages,
    isHydrated: true,
  };
}

export async function GET(req: NextRequest) {
  try {
    const $wsa = await requireAppWorkspaceRead(req);

    if (!$wsa.ok) return $wsa.response;

    const workspaceId = $wsa.value.workspaceId;
    const leadId = req.nextUrl.searchParams.get("leadId");
    const entries = await listConversationEntries(workspaceId);

    if (leadId) {
      const entry = entries.find((item) => item.lead.id === leadId);
      if (!entry) {
        return NextResponse.json({ conversation: null }, { status: 404 });
      }

      const conversation = await hydrateConversation(entry.lead, entry.campaign);
      return NextResponse.json({ conversation });
    }

    const conversations = entries
      .map(({ lead, campaign }) => buildConversationSummary(lead, campaign))
      .filter((conversation): conversation is ConversationRecord => Boolean(conversation))
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error("Unibox API error:", error);
    return NextResponse.json({ conversations: [] });
  }
}
