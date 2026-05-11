"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Loader2,
  Copy,
  Pause,
  Play,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Campaign, CampaignStats } from "@/lib/types";
import { apiFetch } from "@/lib/api-client";

type CampaignWithStats = Campaign & { stats: CampaignStats };

// ── Main ────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function loadCampaigns() {
    setLoading(true);
    apiFetch("/api/campaigns")
      .then((r) => r.json())
      .then((d) => setCampaigns(d.campaigns || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function handleNewCampaign() {
    setCreateError(null);
    setCreating(true);
    try {
      const agentsRes = await apiFetch("/api/agent");
      const agentsBody = await agentsRes.json().catch(() => ({}));
      const agents = (agentsBody.agents || []) as { id: string }[];
      if (!agentsRes.ok || agents.length === 0) {
        setCreateError("Create an AI Agent first — every campaign requires one.");
        return;
      }
      const agentId = agents[0].id;
      const campaignName = window.prompt("Campaign name", `Campaign ${new Date().toISOString().slice(0, 10)}`)?.trim();
      if (!campaignName) return;

      const res = await apiFetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          name: campaignName,
          status: "draft",
          segment: "default",
          search: {
            keywords: "",
            titleFilter: "",
            language: "en",
            locations: [],
          },
          sequence: [
            {
              step: 1,
              type: "connection_request",
              delayDays: 0,
              trigger: "immediate",
              content: "Hi {{first_name}}, I'd like to connect.",
            },
            {
              step: 2,
              type: "message",
              delayDays: 1,
              trigger: "accepted",
              content: "Thanks for connecting, {{first_name}}.",
            },
          ],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(typeof body.error === "string" ? body.error : "Failed to create campaign");
        return;
      }
      const id = body.campaign?.id as string | undefined;
      if (id) router.push(`/campaigns/${id}`);
      else loadCampaigns();
    } finally {
      setCreating(false);
    }
  }

  async function renameCampaign(campaign: CampaignWithStats) {
    const nextName = window.prompt("Rename campaign", campaign.name)?.trim();
    if (!nextName || nextName === campaign.name) return;
    setBusyId(campaign.id);
    try {
      const res = await apiFetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...campaign,
          name: nextName,
        }),
      });
      if (!res.ok) throw new Error("Rename failed");
      loadCampaigns();
    } finally {
      setBusyId(null);
    }
  }

  async function runCampaignAction(id: string, action: "toggle" | "duplicate" | "delete") {
    setBusyId(id);
    try {
      const res = await apiFetch("/api/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          ...(action === "duplicate" ? { action: "duplicate" } : {}),
          ...(action === "delete" ? { action: "delete" } : {}),
        }),
      });

      if (!res.ok) {
        throw new Error("Campaign action failed");
      }

      loadCampaigns();
    } finally {
      setBusyId(null);
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
        <div>
          <h2 className="text-2xl font-medium tracking-[-0.04em] text-gradient">Campaigns</h2>
          <p className="text-sm text-stone mt-1">
            Manage your outreach sequences
          </p>
          {createError ? (
            <p className="text-sm text-destructive mt-2">{createError}</p>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          className="gap-1.5 bg-brand text-white hover:bg-brand-hover"
          disabled={creating}
          onClick={() => void handleNewCampaign()}
        >
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          New campaign
        </Button>
      </div>

      <div className="clean-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-[10px] uppercase tracking-[0.2em] text-stone">Campaign</TableHead>
              <TableHead className="text-center text-[10px] uppercase tracking-[0.2em] text-stone">Leads</TableHead>
              <TableHead className="text-center text-[10px] uppercase tracking-[0.2em] text-stone">Connect %</TableHead>
              <TableHead className="text-center text-[10px] uppercase tracking-[0.2em] text-stone">Reply %</TableHead>
              <TableHead className="text-center text-[10px] uppercase tracking-[0.2em] text-stone">Steps</TableHead>
              <TableHead className="text-center text-[10px] uppercase tracking-[0.2em] text-stone">Status</TableHead>
              <TableHead className="text-center text-[10px] uppercase tracking-[0.2em] text-stone">Created</TableHead>
              <TableHead className="text-center text-[10px] uppercase tracking-[0.2em] text-stone">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((c) => (
              <TableRow
                key={c.id}
                className="border-border cursor-pointer hover:bg-muted/20"
              >
                <TableCell>
                  <Link href={`/campaigns/${c.id}`} className="block">
                    <span className="font-medium text-foreground">{c.name}</span>
                    <p className="text-xs text-stone">
                      Segment: {c.segment} | {c.search.language.toUpperCase()}
                    </p>
                  </Link>
                </TableCell>
                <TableCell className="text-center text-muted-foreground">{c.stats.totalLeads}</TableCell>
                <TableCell className="text-center">
                  {c.stats.connectRate > 0 ? (
                    <span className="text-success">{c.stats.connectRate}%</span>
                  ) : (
                    <span className="text-stone">--</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {c.stats.replyRate > 0 ? (
                    <span className="text-success">{c.stats.replyRate}%</span>
                  ) : (
                    <span className="text-stone">--</span>
                  )}
                </TableCell>
                <TableCell className="text-center text-muted-foreground">
                  {c.sequence.length}
                </TableCell>
                <TableCell className="text-center">
                  <Badge
                    variant="secondary"
                    className={`gap-1.5 ${
                      c.status === "active"
                        ? "bg-success/10 text-success"
                        : "bg-muted/40 text-stone"
                    }`}
                  >
                    <span
                      className={`size-1.5 rounded-full ${
                        c.status === "active" ? "bg-success" : "bg-stone"
                      }`}
                    />
                    {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell className="text-center text-muted-foreground text-xs">
                  {new Date(c.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      onClick={() => runCampaignAction(c.id, "toggle")}
                      disabled={busyId === c.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted/40 disabled:opacity-50"
                    >
                      {c.status === "active" ? <Pause className="size-3" /> : <Play className="size-3" />}
                      {c.status === "active" ? "Pause" : "Activate"}
                    </button>
                    <button
                      onClick={() => { void renameCampaign(c); }}
                      disabled={busyId === c.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted/40 disabled:opacity-50"
                    >
                      <Pencil className="size-3" />
                      Rename
                    </button>
                    <button
                      onClick={() => runCampaignAction(c.id, "duplicate")}
                      disabled={busyId === c.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted/40 disabled:opacity-50"
                    >
                      <Copy className="size-3" />
                      Duplicate
                    </button>
                    <button
                      onClick={() => runCampaignAction(c.id, "delete")}
                      disabled={busyId === c.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-destructive/20 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <Trash2 className="size-3" />
                      Delete
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {campaigns.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-stone py-8">
                  No campaigns yet. Create your first one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
