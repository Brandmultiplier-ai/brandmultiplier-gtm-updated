"use client";

import { useState, useEffect } from "react";
import {
  Search,
  Filter,
  Download,
  Plus,
  Flame,
  Linkedin,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Lead, LeadStatus } from "@/lib/types";
import { useAppStore } from "@/stores/app-store";
import { CsvImportDialog } from "@/components/leads/csv-import-dialog";

// ── Components ─────────────────────────────────────────────────────────

function FireScore({ score }: { score: number }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: 3 }).map((_, i) => (
        <Flame
          key={i}
          className={`size-3.5 ${
            i < score ? "text-brand fill-brand" : "text-stone/30"
          }`}
        />
      ))}
    </span>
  );
}

const SIGNAL_SOURCE_LABELS: Record<string, string> = {
  keyword_search: "Keyword search",
  post_engagement: "Post engagement",
  recent_activity: "Recent activity",
  profile_visitors: "Profile visitor",
  company_page: "Company page",
  company_followers: "Company followers",
  job_changes: "Job change",
  recent_funding: "Recent funding",
  top_active: "Top active",
};

function SignalCell({ signal }: { signal: string }) {
  let parsedSignal: { source?: string; icpFit?: number; intentScore?: number } | null = null;

  try {
    const parsed = JSON.parse(signal);
    if (parsed && typeof parsed === "object" && "source" in parsed) {
      parsedSignal = parsed as { source?: string; icpFit?: number; intentScore?: number };
    }
  } catch {
    parsedSignal = null;
  }

  if (parsedSignal?.source) {
    const sourceLabel = SIGNAL_SOURCE_LABELS[parsedSignal.source] || parsedSignal.source;
    const icpPct = typeof parsedSignal.icpFit === "number" ? Math.round(parsedSignal.icpFit * 100) : null;
    const intent = typeof parsedSignal.intentScore === "number" ? parsedSignal.intentScore : null;
    return (
      <div className="space-y-0.5">
        <p className="text-xs text-muted-foreground">{sourceLabel}</p>
        <div className="flex items-center gap-2">
          {icpPct !== null && (
            <span className="text-[10px] font-mono text-stone">ICP {icpPct}%</span>
          )}
          {intent !== null && (
            <span className="text-[10px] font-mono text-stone">Intent {intent}/5</span>
          )}
        </div>
      </div>
    );
  }

  return <p className="text-sm text-muted-foreground">{signal}</p>;
}

const STATUS_CONFIG: Record<LeadStatus, { label: string; className: string }> = {
  discovered: { label: "Discovered", className: "bg-terracotta/10 text-coral" },
  new: { label: "New", className: "bg-coral/10 text-coral" },
  invite_sent: { label: "Invite sent", className: "bg-success/10 text-success" },
  already_invited: { label: "Already invited", className: "bg-warning/10 text-warning" },
  invite_failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
  accepted: { label: "Accepted", className: "bg-coral/10 text-coral" },
  message_sent: { label: "Message sent", className: "bg-success/10 text-success" },
  manual_override: { label: "Manual override", className: "bg-warning/10 text-warning" },
  replied: { label: "Replied", className: "bg-brand/10 text-terracotta" },
  interested: { label: "Interested", className: "bg-brand/10 text-terracotta" },
  not_interested: { label: "Not interested", className: "bg-muted/40 text-stone" },
  rate_limited: { label: "Rate limited", className: "bg-warning/10 text-warning" },
  skipped: { label: "Skipped", className: "bg-muted/40 text-stone" },
};

interface ContactListItem {
  id: string;
  name: string;
  description?: string;
  leadIds: string[];
  createdAt: string;
  updatedAt: string;
}

type LeadWithCampaign = Lead & {
  campaignName?: string | null;
  campaignStatus?: string | null;
};

// ── Page ───────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const [leads, setLeads] = useState<LeadWithCampaign[]>([]);
  const [lists, setLists] = useState<ContactListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const searchQuery = useAppStore((state) => state.leadsSearch);
  const setSearchQuery = useAppStore((state) => state.setLeadsSearch);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewTab, setViewTab] = useState<"contacts" | "lists">("contacts");
  const [statusTab, setStatusTab] = useState<"all" | "sent" | "accepted" | "pending">("all");
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState("");
  const [targetListId, setTargetListId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  function loadData() {
    setLoading(true);
    Promise.all([
      fetch("/api/leads").then((r) => r.json()).catch(() => ({ leads: [] })),
      fetch("/api/lists").then((r) => r.json()).catch(() => ({ lists: [] })),
    ])
      .then(([leadsData, listsData]) => {
        setLeads(leadsData.leads || []);
        setLists(listsData.lists || []);
        if (!selectedListId && listsData.lists?.length > 0) {
          setSelectedListId(listsData.lists[0].id);
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
  }, []);

  const filtered = leads
    .filter((l) => {
      if (statusTab === "sent") return l.status === "invite_sent";
      if (statusTab === "accepted") return l.status === "accepted" || l.status === "replied" || l.status === "manual_override";
      if (statusTab === "pending") return l.status === "new" || l.status === "rate_limited" || l.status === "discovered";
      return true;
    })
    .filter(
      (l) =>
        !searchQuery ||
        l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.headline.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.campaignName || "").toLowerCase().includes(searchQuery.toLowerCase())
    );

  const sentCount = leads.filter((l) => l.status === "invite_sent").length;
  const acceptedCount = leads.filter((l) => l.status === "accepted" || l.status === "replied" || l.status === "manual_override").length;
  const pendingCount = leads.filter((l) =>
    l.status === "new" || l.status === "rate_limited" || l.status === "discovered"
  ).length;
  const selectedList = lists.find((list) => list.id === selectedListId) || null;
  const listLeads = selectedList
    ? leads.filter((lead) => selectedList.leadIds.includes(lead.id))
    : [];

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((l) => l.id)));
  }

  function exportCsv(rows: LeadWithCampaign[], fileName: string) {
    const csv = [
      ["Name", "Headline", "Location", "Campaign", "Signal", "AI Score", "Status", "Segment", "Language"],
      ...rows.map((lead) => [
        lead.name,
        lead.headline,
        lead.location,
        lead.campaignName || lead.campaignId,
        lead.signal,
        String(lead.aiScore),
        STATUS_CONFIG[lead.status]?.label || lead.status,
        lead.segment,
        lead.language,
      ]),
    ]
      .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function createList() {
    if (!newListName.trim()) return;
    setBusy("create-list");
    try {
      await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newListName }),
      });
      setNewListName("");
      loadData();
    } finally {
      setBusy(null);
    }
  }

  async function addSelectedToList(listId: string) {
    if (!listId || selected.size === 0) return;
    setBusy(`add-${listId}`);
    try {
      await fetch(`/api/lists/${encodeURIComponent(listId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addLeads",
          leadIds: Array.from(selected),
        }),
      });
      setTargetListId("");
      loadData();
    } finally {
      setBusy(null);
    }
  }

  async function removeLeadFromList(listId: string, leadId: string) {
    setBusy(`remove-${leadId}`);
    try {
      await fetch(`/api/lists/${encodeURIComponent(listId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "removeLeads",
          leadIds: [leadId],
        }),
      });
      loadData();
    } finally {
      setBusy(null);
    }
  }

  async function deleteList(listId: string) {
    setBusy(`delete-${listId}`);
    try {
      await fetch(`/api/lists/${encodeURIComponent(listId)}`, {
        method: "DELETE",
      });
      if (selectedListId === listId) {
        setSelectedListId(null);
      }
      loadData();
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin text-stone" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Tabs value={viewTab} onValueChange={(v) => v && setViewTab(v as "contacts" | "lists")}>
          <TabsList>
            <TabsTrigger value="contacts">All contacts ({leads.length})</TabsTrigger>
            <TabsTrigger value="lists">Lists ({lists.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        {viewTab === "contacts" ? (
          <div className="flex items-center gap-2">
            {[
              { id: "all", label: `All (${leads.length})` },
              { id: "sent", label: `Sent (${sentCount})` },
              { id: "accepted", label: `Accepted (${acceptedCount})` },
              { id: "pending", label: `Pending (${pendingCount})` },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setStatusTab(item.id as "all" | "sent" | "accepted" | "pending")}
                className={`rounded-lg px-3 py-1.5 text-xs border transition-colors ${
                  statusTab === item.id
                    ? "border-orange-500/30 bg-brand/10 text-orange-300"
                    : "border-border text-muted-foreground hover:bg-muted/30"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="New list name..."
              className="w-56"
            />
            <Button
              size="sm"
              onClick={createList}
              disabled={busy === "create-list" || !newListName.trim()}
              className="gap-1.5 bg-brand text-white hover:bg-brand-hover"
            >
              <Plus className="size-3.5" /> Create list
            </Button>
          </div>
        )}
      </div>

      {viewTab === "contacts" ? (
        <>
          {importMessage ? (
            <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
              {importMessage}
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-stone" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, headline, location..."
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 border-border text-muted-foreground hover:bg-muted/40">
              <Filter className="size-3.5" /> Filters
            </Button>
            <div className="flex-1" />
            {selected.size > 0 && lists.length > 0 && (
              <>
                <select
                  value={targetListId}
                  onChange={(e) => setTargetListId(e.target.value)}
                  className="h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm text-muted-foreground focus:outline-none"
                >
                  <option value="">Add to list...</option>
                  {lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!targetListId || busy === `add-${targetListId}`}
                  onClick={() => addSelectedToList(targetListId)}
                  className="gap-1.5 border-border text-muted-foreground hover:bg-muted/40"
                >
                  <Plus className="size-3.5" /> Add to list
                </Button>
              </>
            )}
            {selected.size > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportCsv(leads.filter((lead) => selected.has(lead.id)), "selected-contacts.csv")}
                className="gap-1.5 border-border text-muted-foreground hover:bg-muted/40"
              >
                <Download className="size-3.5" /> Export ({selected.size})
              </Button>
            )}
            <Button
              size="sm"
              className="gap-1.5 bg-brand text-white hover:bg-brand-hover"
              onClick={() => setImportDialogOpen(true)}
            >
              <Plus className="size-3.5" /> Add leads
            </Button>
          </div>

          <div className="clean-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      className="rounded border-border"
                    />
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-[0.2em] text-stone">Contact</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-[0.2em] text-stone">Campaign</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-[0.2em] text-stone">Signal</TableHead>
                  <TableHead className="text-center text-[10px] uppercase tracking-[0.2em] text-stone">AI Score</TableHead>
                  <TableHead className="text-center text-[10px] uppercase tracking-[0.2em] text-stone">Status</TableHead>
                  <TableHead className="text-center text-[10px] uppercase tracking-[0.2em] text-stone">Segment</TableHead>
                  <TableHead className="text-center text-[10px] uppercase tracking-[0.2em] text-stone">Language</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-stone py-12">
                      {leads.length === 0
                        ? "No leads yet. Run an outreach campaign to find prospects."
                        : "No leads match your filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((lead) => (
                    <TableRow key={lead.id} className="border-border hover:bg-muted/20">
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selected.has(lead.id)}
                          onChange={() => toggleSelect(lead.id)}
                          className="rounded border-border"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {lead.profilePictureUrl ? (
                            <img
                              src={lead.profilePictureUrl}
                              alt={lead.name}
                              className="size-9 rounded-full object-cover border border-border shrink-0"
                            />
                          ) : (
                            <div className="size-9 rounded-full bg-muted/40 border border-border flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
                              {lead.name.split(" ").map((n) => n[0]).join("")}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-sm text-foreground">{lead.name}</span>
                              <Linkedin className="size-3 text-coral" />
                            </div>
                            <p className="text-xs text-stone">{lead.headline}</p>
                            <p className="text-xs text-stone">{lead.location}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            {lead.campaignName || "Unknown campaign"}
                          </p>
                          <p className="text-[10px] uppercase tracking-[0.16em] text-stone">
                            {lead.campaignStatus || "Campaign"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <SignalCell signal={lead.signal} />
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center">
                          <FireScore score={lead.aiScore} />
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="secondary"
                          className={`text-xs ${STATUS_CONFIG[lead.status]?.className || ""}`}
                        >
                          {STATUS_CONFIG[lead.status]?.label || lead.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                          {lead.segment}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-xs text-stone uppercase">{lead.language}</span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-stone">
                {filtered.length} of {leads.length} contacts
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-xs" disabled className="border-border">
                  <ChevronLeft className="size-3" />
                </Button>
                <Button size="xs" className="min-w-7 bg-brand text-white">1</Button>
                <Button variant="outline" size="icon-xs" disabled className="border-border">
                  <ChevronRight className="size-3" />
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="clean-card overflow-hidden">
            <div className="px-4 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Lists</h3>
                <p className="text-[10px] text-stone mt-1">Organize contacts into groups</p>
              </div>
              {selected.size > 0 && (
                <span className="text-[10px] text-stone">{selected.size} selected</span>
              )}
            </div>
            <div className="divide-y divide-border/60">
              {lists.length === 0 ? (
                <div className="px-4 py-10 text-center text-stone text-sm">
                  No lists yet.
                </div>
              ) : (
                lists.map((list) => (
                  <div
                    key={list.id}
                    className={`px-4 py-4 cursor-pointer transition-colors ${
                      selectedListId === list.id ? "bg-muted/40" : "hover:bg-muted/20"
                    }`}
                    onClick={() => setSelectedListId(list.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{list.name}</p>
                        <p className="text-[11px] text-stone mt-1">
                          {list.leadIds.length} contact{list.leadIds.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {selected.size > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              addSelectedToList(list.id);
                            }}
                            disabled={busy === `add-${list.id}`}
                            className="rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted/40 disabled:opacity-50"
                          >
                            Add selected
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteList(list.id);
                          }}
                          disabled={busy === `delete-${list.id}`}
                          className="rounded-lg border border-destructive/20 p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="clean-card overflow-hidden">
            {selectedList ? (
              <>
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-foreground">{selectedList.name}</h3>
                    <p className="text-[10px] text-stone mt-1">
                      {listLeads.length} contact{listLeads.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportCsv(listLeads, `${selectedList.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`)}
                    className="gap-1.5 border-border text-muted-foreground"
                  >
                    <Download className="size-3.5" /> Export list
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-[10px] uppercase tracking-[0.2em] text-stone">Contact</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-[0.2em] text-stone">Campaign</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-[0.2em] text-stone">Signal</TableHead>
                      <TableHead className="text-center text-[10px] uppercase tracking-[0.2em] text-stone">AI Score</TableHead>
                      <TableHead className="text-center text-[10px] uppercase tracking-[0.2em] text-stone">Status</TableHead>
                      <TableHead className="text-center text-[10px] uppercase tracking-[0.2em] text-stone">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listLeads.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-stone py-12">
                          This list is empty.
                        </TableCell>
                      </TableRow>
                    ) : (
                      listLeads.map((lead) => (
                        <TableRow key={lead.id} className="border-border hover:bg-muted/20">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {lead.profilePictureUrl ? (
                                <img
                                  src={lead.profilePictureUrl}
                                  alt={lead.name}
                                  className="size-9 rounded-full object-cover border border-border shrink-0"
                                />
                              ) : (
                                <div className="size-9 rounded-full bg-muted/40 border border-border flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
                                  {lead.name.split(" ").map((n) => n[0]).join("")}
                                </div>
                              )}
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium text-sm text-foreground">{lead.name}</span>
                                  <Linkedin className="size-3 text-coral" />
                                </div>
                                <p className="text-xs text-stone">{lead.headline}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-foreground">
                                {lead.campaignName || "Unknown campaign"}
                              </p>
                              <p className="text-[10px] uppercase tracking-[0.16em] text-stone">
                                {lead.campaignStatus || "Campaign"}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <SignalCell signal={lead.signal} />
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center">
                              <FireScore score={lead.aiScore} />
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="secondary"
                              className={`text-xs ${STATUS_CONFIG[lead.status]?.className || ""}`}
                            >
                              {STATUS_CONFIG[lead.status]?.label || lead.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <button
                              onClick={() => removeLeadFromList(selectedList.id, lead.id)}
                              disabled={busy === `remove-${lead.id}`}
                              className="rounded-lg border border-destructive/20 p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </>
            ) : (
              <div className="px-6 py-20 text-center text-stone">
                Select a list to view its contacts.
              </div>
            )}
          </div>
        </div>
      )}
      <CsvImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImported={(summary) => {
          setImportMessage(
            `Imported ${summary.imported}/${summary.total} contacts (${summary.duplicate} duplicates, ${summary.invalid} invalid).`,
          );
          loadData();
        }}
      />
    </div>
  );
}
