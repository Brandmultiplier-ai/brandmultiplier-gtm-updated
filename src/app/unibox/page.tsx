"use client";

import { useState, useEffect, useRef } from "react";
import {
  Loader2,
  Search,
  Send,
  Linkedin,
  Building2,
  MapPin,
  Briefcase,
  Flame,
  MessageSquare,
  Inbox,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

// ── Types ──────────────────────────────────────────────────────────────

interface Conversation {
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
  messages?: Message[];
}

interface Message {
  id: string;
  sender: "me" | "them";
  content: string;
  timestamp: string;
}

// ── Components ─────────────────────────────────────────────────────────

function LeadAvatar({ name, pictureUrl, size = "md" }: { name: string; pictureUrl?: string; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "sm" ? "size-9" : size === "lg" ? "size-14" : "size-10";
  const textClass = size === "lg" ? "text-base" : "text-xs";
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2);

  if (pictureUrl) {
    return <img src={pictureUrl} alt={name} className={`${sizeClass} rounded-full object-cover border border-border`} />;
  }
  return (
    <div className={`${sizeClass} rounded-full bg-muted/40 border border-border flex items-center justify-center ${textClass} font-medium text-muted-foreground`}>
      {initials}
    </div>
  );
}

function FireScore({ score }: { score: number }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: 3 }).map((_, i) => (
        <Flame key={i} className={`size-3 ${i < score ? "text-brand fill-brand" : "text-stone"}`} />
      ))}
    </span>
  );
}

function SignalBadge({ source }: { source: string }) {
  const labels: Record<string, string> = {
    keyword_search: "Keyword match",
    post_engagement: "Post engagement",
    recent_activity: "Recent activity",
    profile_visitors: "Profile visitor",
    company_page: "Company page",
    company_followers: "Company follower",
    job_changes: "Job change",
    recent_funding: "Recent funding",
    top_active: "Top 5% active",
  };
  return (
    <span className="text-[10px] text-muted-foreground bg-muted/40 border border-border px-2 py-0.5 rounded-full">
      {labels[source] || source}
    </span>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────

export default function UniboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hydratingId, setHydratingId] = useState<string | null>(null);
  const search = useAppStore((state) => state.uniboxSearch);
  const setSearch = useAppStore((state) => state.setUniboxSearch);
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [chatFilter, setChatFilter] = useState<"all" | "linked" | "local-only">("all");
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/unibox")
      .then((r) => r.json())
      .then((data: { conversations: Conversation[] }) => {
        setConversations(data.conversations || []);
        if (data.conversations?.length > 0) {
          setSelectedId(data.conversations[0].leadId);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedId, conversations]);

  const availableStatuses = Array.from(
    new Set(conversations.map((conversation) => conversation.status).filter(Boolean))
  ).sort();

  const activeFilters =
    (statusFilter !== "all" ? 1 : 0) +
    (chatFilter !== "all" ? 1 : 0);

  const filtered = conversations.filter((conversation) => {
    const matchesSearch =
      !search ||
      conversation.name.toLowerCase().includes(search.toLowerCase()) ||
      conversation.company.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || conversation.status === statusFilter;
    const matchesChat =
      chatFilter === "all" ||
      (chatFilter === "linked" ? Boolean(conversation.chatId) : !conversation.chatId);
    return matchesSearch && matchesStatus && matchesChat;
  });

  const selected = conversations.find((c) => c.leadId === selectedId) || null;
  const selectedMessages = selected?.messages || [];
  const selectedNeedsHydration = Boolean(selected && selectedMessages.length === 0);

  useEffect(() => {
    if (!selectedId || !selectedNeedsHydration) return;

    let cancelled = false;
    setHydratingId(selectedId);

    fetch(`/api/unibox?leadId=${selectedId}`)
      .then((response) => response.json())
      .then((data: { conversation?: Conversation | null }) => {
        if (cancelled || !data.conversation) return;
        setConversations((prev) =>
          prev.map((conversation) =>
            conversation.leadId === selectedId
              ? { ...conversation, ...data.conversation }
              : conversation
          )
        );
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setHydratingId((current) => (current === selectedId ? null : current));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, selectedNeedsHydration]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  function downloadJson(filename: string, payload: unknown) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleExportSelected() {
    if (!selected) return;

    downloadJson(
      `${selected.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-conversation-export.json`,
      {
        exportedAt: new Date().toISOString(),
        conversation: selected,
      }
    );
  }

  async function handleSend() {
    if (!messageInput.trim() || !selected) return;
    const draft = messageInput;
    const previousConversations = conversations;
    setSending(true);
    setSendError(null);

    // Optimistic update
    const newMsg: Message = {
      id: `msg-${Date.now()}`,
      sender: "me",
      content: draft,
      timestamp: new Date().toISOString(),
    };
    setConversations((prev) =>
      prev.map((c) =>
        c.leadId === selected.leadId
          ? {
              ...c,
              messages: [...(c.messages || []), newMsg],
              lastMessage: draft,
              lastMessageAt: newMsg.timestamp,
            }
          : c
      )
    );
    setMessageInput("");

    try {
      const res = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: selected.leadId,
          campaignId: selected.campaignId,
          chatId: selected.chatId,
          message: newMsg.content,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) {
        throw new Error(body.error || "Message send failed");
      }

      if (body.chatId) {
        setConversations((prev) =>
          prev.map((conversation) =>
            conversation.leadId === selected.leadId
              ? { ...conversation, chatId: body.chatId }
              : conversation
          )
        );
      }
    } catch {
      setConversations(previousConversations);
      setMessageInput(draft);
      setSendError("Message send failed");
    }
    setSending(false);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border flex items-center gap-3 shrink-0">
        <Inbox className="size-5 text-stone" />
        <div>
          <h2 className="text-xl font-medium tracking-[-0.04em] text-foreground">Unibox</h2>
          <p className="text-[11px] text-stone mt-0.5">Unified inbox for all your conversations</p>
        </div>
      </div>

      {/* 3-column layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left — Conversation list */}
        <div className="w-[320px] border-r border-border flex flex-col shrink-0">
          {/* Search */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-stone" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search conversations..."
                  className="w-full bg-muted/20 border border-border rounded-lg pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-stone focus:outline-none focus:border-border"
                />
              </div>
              <button
                onClick={() => setShowFilters((current) => !current)}
                className={cn(
                  "size-8 rounded-lg flex items-center justify-center border transition-colors relative",
                  showFilters || activeFilters > 0
                    ? "border-orange-500/20 bg-brand/10 text-orange-300"
                    : "border-border text-stone hover:text-muted-foreground hover:bg-muted/20"
                )}
              >
                <Filter className="size-3.5" />
                {activeFilters > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-brand text-[9px] font-medium text-white flex items-center justify-center">
                    {activeFilters}
                  </span>
                )}
              </button>
            </div>
            {showFilters && (
              <div className="mt-3 grid gap-2">
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-stone">Status</span>
                    <select
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value)}
                      className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-foreground focus:outline-none"
                    >
                      <option value="all">All statuses</option>
                      {availableStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-stone">Chat sync</span>
                    <select
                      value={chatFilter}
                      onChange={(event) =>
                        setChatFilter(event.target.value as "all" | "linked" | "local-only")
                      }
                      className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-foreground focus:outline-none"
                    >
                      <option value="all">All conversations</option>
                      <option value="linked">Linked to live chat</option>
                      <option value="local-only">Local fallback only</option>
                    </select>
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-stone">
                    Narrow the inbox to the conversations you want to work on now.
                  </p>
                  <button
                    onClick={() => {
                      setStatusFilter("all");
                      setChatFilter("all");
                    }}
                    className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
            <p className="text-[10px] text-stone mt-2">
              {filtered.length} conversation{filtered.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-stone">
                <MessageSquare className="size-8 mb-3 opacity-20" />
                <p className="text-[10px] uppercase tracking-[0.2em]">No conversations</p>
              </div>
            ) : (
              filtered.map((conv) => (
                <button
                  key={conv.leadId}
                  onClick={() => setSelectedId(conv.leadId)}
                  className={cn(
                    "w-full px-4 py-3.5 flex items-start gap-3 text-left transition-all border-l-2",
                    selectedId === conv.leadId
                      ? "bg-muted/40 border-l-orange-500"
                      : "border-l-transparent hover:bg-muted/20"
                  )}
                >
                  <LeadAvatar name={conv.name} pictureUrl={conv.profilePictureUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground truncate">{conv.name}</p>
                      <span className="text-[9px] text-stone shrink-0 ml-2">
                        {formatTimeAgo(conv.lastMessageAt)}
                      </span>
                    </div>
                    <p className="text-[10px] text-stone truncate mt-0.5">{conv.lastMessage}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Center — Chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {selected ? (
            <>
              {/* Chat header */}
              <div className="px-5 py-3 border-b border-border flex items-center gap-3 shrink-0">
                <LeadAvatar name={selected.name} pictureUrl={selected.profilePictureUrl} size="sm" />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{selected.name}</p>
                    <Linkedin className="size-3.5 text-[#0077B5]" />
                  </div>
                  <p className="text-[10px] text-stone">
                    {hydratingId === selected.leadId
                      ? "Loading messages..."
                      : `${selectedMessages.length} message${selectedMessages.length !== 1 ? "s" : ""}`}
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {selectedMessages.length > 0 ? (
                  selectedMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex",
                        msg.sender === "me" ? "justify-end" : "justify-start"
                      )}
                    >
                      <div className={cn(
                        "max-w-[70%] rounded-xl px-4 py-3",
                        msg.sender === "me"
                          ? "bg-brand/15 border border-orange-500/20"
                          : "bg-muted/40 border border-border"
                      )}>
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        <p className="text-[9px] text-stone mt-1.5 text-right">
                          {new Date(msg.timestamp).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                        </p>
                      </div>
                    </div>
                  ))
                ) : hydratingId === selected.leadId ? (
                  <div className="flex items-center justify-center h-full text-stone">
                    <Loader2 className="size-5 animate-spin mr-2" />
                    <span className="text-xs">Loading conversation…</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-stone">
                    <span className="text-xs">No messages found for this thread.</span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="px-5 py-4 border-t border-border shrink-0">
                {sendError && (
                  <p className="mb-3 text-xs text-destructive">{sendError}</p>
                )}
                <div className="flex items-end gap-3">
                  <textarea
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Type a message..."
                    className="flex-1 bg-muted/20 border border-border rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-stone resize-none focus:outline-none focus:border-border min-h-[44px] max-h-32"
                    rows={1}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!messageInput.trim() || sending}
                    className={cn(
                      "size-10 rounded-lg flex items-center justify-center transition-all",
                      messageInput.trim()
                        ? "bg-brand/20 hover:bg-brand/30 text-orange-400 border border-orange-500/20"
                        : "bg-muted/20 text-stone border border-border"
                    )}
                  >
                    <Send className="size-4" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-stone">
              <MessageSquare className="size-10 mb-4 opacity-20" />
              <p className="text-[10px] uppercase tracking-[0.2em]">Select a conversation</p>
            </div>
          )}
        </div>

        {/* Right — Contact info */}
        <div className="w-[300px] border-l border-border overflow-y-auto shrink-0">
          {selected ? (
            <div className="p-5 space-y-5">
              <h4 className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone">Contact Information</h4>

              {/* Avatar + name */}
              <div className="flex flex-col items-center text-center">
                <LeadAvatar name={selected.name} pictureUrl={selected.profilePictureUrl} size="lg" />
                <div className="mt-3 flex items-center gap-2">
                  <p className="text-base font-medium text-foreground">{selected.name}</p>
                  <a
                    href={`https://linkedin.com/in/${selected.publicIdentifier}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0077B5]"
                  >
                    <Linkedin className="size-4" />
                  </a>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{selected.headline}</p>
              </div>

              {/* Details */}
              <div className="space-y-4">
                <div>
                  <h5 className="text-[9px] font-medium uppercase tracking-[0.2em] text-stone mb-2">Company</h5>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="size-3.5 text-stone" />
                      {selected.companyLinkedInUrl ? (
                        <a
                          href={selected.companyLinkedInUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-foreground hover:text-foreground"
                        >
                          {selected.companyName || selected.company || "Unknown"}
                        </a>
                      ) : (
                        <span className="text-sm text-foreground">{selected.companyName || selected.company || "Unknown"}</span>
                      )}
                    </div>
                    {selected.companySize && (
                      <p className="text-[11px] text-muted-foreground">{selected.companySize}</p>
                    )}
                    {selected.companyDescription && (
                      <p className="text-[11px] text-stone leading-relaxed">
                        {selected.companyDescription}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <h5 className="text-[9px] font-medium uppercase tracking-[0.2em] text-stone mb-2">Signal</h5>
                  <div className="space-y-1.5">
                    <SignalBadge source={selected.signalSource} />
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {selected.signal || "Matched ICP criteria"}
                    </p>
                  </div>
                </div>

                <div>
                  <h5 className="text-[9px] font-medium uppercase tracking-[0.2em] text-stone mb-2">Industry</h5>
                  <div className="flex items-center gap-2">
                    <Briefcase className="size-3.5 text-stone" />
                    <span className="text-sm text-muted-foreground">{selected.industry || "Unknown"}</span>
                  </div>
                </div>

                <div>
                  <h5 className="text-[9px] font-medium uppercase tracking-[0.2em] text-stone mb-2">Location</h5>
                  <div className="flex items-center gap-2">
                    <MapPin className="size-3.5 text-stone" />
                    <span className="text-sm text-muted-foreground">{selected.location || "Unknown"}</span>
                  </div>
                </div>

                <div>
                  <h5 className="text-[9px] font-medium uppercase tracking-[0.2em] text-stone mb-2">AI Score</h5>
                  <FireScore score={selected.aiScore} />
                </div>

                <div>
                  <h5 className="text-[9px] font-medium uppercase tracking-[0.2em] text-stone mb-2">Status</h5>
                  <span className={cn(
                    "text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full",
                    selected.status === "replied" ? "bg-success/20 text-emerald-300" :
                    selected.status === "accepted" ? "bg-coral/20 text-coral" :
                    selected.status === "message_sent" ? "bg-coral/20 text-violet-300" :
                    selected.status === "manual_override" ? "bg-warning/20 text-amber-300" :
                    "bg-muted/40 text-muted-foreground"
                  )}>
                    {selected.status.replace(/_/g, " ")}
                  </span>
                </div>
              </div>

              {/* Export */}
              <button
                onClick={handleExportSelected}
                className="w-full py-2.5 rounded-lg border border-border text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground hover:bg-muted/20 transition-colors"
              >
                Export Contact
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}
