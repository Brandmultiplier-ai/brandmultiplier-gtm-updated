"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api-client";
import {
  Play,
  Zap,
  Eye,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  SkipForward,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Types ──────────────────────────────────────────────────────────────

interface OutreachEvent {
  type: "sent" | "skipped" | "error" | "rate_limited" | "info";
  name?: string;
  location?: string;
  message?: string;
  reason?: string;
}

interface RunResult {
  status: string;
  sent: number;
  skipped: number;
  errors: number;
  events: OutreachEvent[];
}

interface RunLog {
  ts: string;
  status: string;
  sent: number;
  skipped: number;
  errors: number;
}

// ── Page ───────────────────────────────────────────────────────────────

export default function OutreachPage() {
  const [running, setRunning] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [maxInvites, setMaxInvites] = useState(10);
  const [segment, setSegment] = useState("all");
  const [result, setResult] = useState<RunResult | null>(null);
  const [resultDryRun, setResultDryRun] = useState(true);
  const [pastRuns, setPastRuns] = useState<RunLog[]>([]);

  useEffect(() => {
    apiFetch("/api/outreach")
      .then((r) => r.json())
      .then((d) => setPastRuns(d.runs || []))
      .catch(() => {});
  }, [result]);

  async function handleRun() {
    const requestedDryRun = dryRun;
    setRunning(true);
    setResult(null);
    setResultDryRun(requestedDryRun);

    const body: Record<string, unknown> = { dryRun: requestedDryRun, maxInvites };
    if (segment !== "all") body.segment = segment;

    try {
      const res = await apiFetch("/api/outreach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({
        status: "error",
        sent: 0,
        skipped: 0,
        errors: 1,
        events: [{ type: "error", reason: String(err) }],
      });
    } finally {
      setRunning(false);
    }
  }

  function eventIcon(type: string) {
    switch (type) {
      case "sent":
        return <CheckCircle2 className="size-4 text-success" />;
      case "skipped":
        return <SkipForward className="size-4 text-stone" />;
      case "error":
        return <XCircle className="size-4 text-destructive" />;
      case "rate_limited":
        return <AlertCircle className="size-4 text-warning" />;
      default:
        return <Clock className="size-4 text-stone" />;
    }
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-medium tracking-[-0.04em] text-gradient">Outreach Engine</h2>
        <p className="text-sm text-stone mt-1">
          Run automated LinkedIn outreach campaigns
        </p>
      </div>

      {/* Controls */}
      <div className="clean-card p-6">
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-[0.2em] text-stone">Segment</label>
            <Select value={segment} onValueChange={(v) => v && setSegment(v)}>
              <SelectTrigger className="border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All segments</SelectItem>
                <SelectItem value="freelancer">Freelancer & Consultants</SelectItem>
                <SelectItem value="personal-brand">Personal Brand & Creator</SelectItem>
                <SelectItem value="solopreneur">Solopreneur</SelectItem>
                <SelectItem value="marketer">Marketer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-[0.2em] text-stone">Max invites</label>
            <Input
              type="number"
              value={maxInvites}
              onChange={(e) => setMaxInvites(Number(e.target.value))}
              min={1}
              max={50}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-[0.2em] text-stone">Mode</label>
            <div className="flex gap-2">
              <Button
                variant={dryRun ? "default" : "outline"}
                size="sm"
                onClick={() => setDryRun(true)}
                className={`flex-1 ${dryRun ? "bg-warning hover:bg-warning text-white border-warning" : "border-border text-muted-foreground hover:bg-muted/40"}`}
              >
                <Eye className="size-3.5 mr-1.5" />
                Dry Run
              </Button>
              <Button
                variant={!dryRun ? "default" : "outline"}
                size="sm"
                onClick={() => setDryRun(false)}
                className={`flex-1 ${!dryRun ? "bg-success hover:bg-success text-white border-success" : "border-border text-muted-foreground hover:bg-muted/40"}`}
              >
                <Zap className="size-3.5 mr-1.5" />
                Live
              </Button>
            </div>
          </div>
        </div>

        <Button
          onClick={handleRun}
          disabled={running}
          className={`w-full ${
            dryRun
              ? "bg-warning hover:bg-warning text-white"
              : "bg-success hover:bg-success text-white"
          }`}
          size="lg"
        >
          {running ? (
            <>
              <Clock className="size-4 mr-2 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="size-4 mr-2" />
              {dryRun ? "Preview Outreach (Dry Run)" : "Run Outreach (LIVE)"}
            </>
          )}
        </Button>
        <p className="mt-3 text-xs text-stone">
          {dryRun
            ? "Dry Run previews up to the selected number of prospects and does not send anything to LinkedIn."
            : "Live mode sends at most 1 invite in this run. Manual runs bypass weekend and schedule-window holds, while scheduled automation still follows the campaign pacing rules."}
        </p>
      </div>

      {/* Result */}
      {result && (
        <div className="clean-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-3">
            <Badge
              variant="secondary"
              className={
                result.status === "completed"
                  ? "bg-success/10 text-success"
                  : result.status === "rate_limited"
                    ? "bg-warning/10 text-warning"
                    : "bg-destructive/10 text-destructive"
              }
            >
              {result.status}
            </Badge>
            <Badge
              variant="outline"
              className={resultDryRun ? "text-warning border-warning/20" : "text-success border-success/20"}
            >
              {resultDryRun ? "dry run" : "live"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {resultDryRun
                ? `${result.sent} previewed, ${result.skipped} skipped, ${result.errors} errors`
                : `${result.sent} sent, ${result.skipped} skipped, ${result.errors} errors`}
            </span>
          </div>
          <div className="p-6 space-y-1 max-h-96 overflow-y-auto">
            {result.events.map((event, i) => (
              <div
                key={i}
                className="flex items-start gap-3 text-sm px-3 py-2 rounded-md bg-muted/20"
              >
                <span className="mt-0.5">{eventIcon(event.type)}</span>
                <div className="min-w-0 flex-1">
                  {event.type === "sent" && (
                    <>
                      <span className="font-medium text-foreground">{event.name}</span>
                      <span className="text-stone ml-2">
                        ({event.location})
                      </span>
                      {event.reason === "dry-run" && (
                        <Badge variant="outline" className="ml-2 text-xs text-warning border-warning/20">
                          preview
                        </Badge>
                      )}
                      {event.message && (
                        <p className="text-xs text-stone mt-0.5">
                          {event.message}
                        </p>
                      )}
                    </>
                  )}
                  {event.type === "skipped" && (
                    <>
                      <span className="line-through text-stone">
                        {event.name}
                      </span>
                      <span className="text-stone ml-2">
                        ({event.reason})
                      </span>
                    </>
                  )}
                  {event.type === "error" && (
                    <span className="text-destructive">
                      {event.name ? `${event.name}: ` : ""}
                      {event.reason}
                    </span>
                  )}
                  {event.type === "rate_limited" && (
                    <span className="text-warning">{event.message}</span>
                  )}
                  {event.type === "info" && (
                    <span className="text-muted-foreground">{event.message}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past runs */}
      {pastRuns.length > 0 && (
        <div className="clean-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone">Previous runs</h3>
          </div>
          <div className="p-6 space-y-2">
            {pastRuns.map((run, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="text-xs text-stone w-40 font-mono">
                  {new Date(run.ts).toLocaleString("it-IT")}
                </span>
                <Badge
                  variant="secondary"
                  className={`text-xs ${
                    run.status === "completed"
                      ? "bg-success/10 text-success"
                      : "bg-warning/10 text-warning"
                  }`}
                >
                  {run.status}
                </Badge>
                <span className="text-muted-foreground">
                  {run.sent} sent, {run.skipped} skip, {run.errors} err
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
