"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type CampaignOption = {
  id: string;
  name: string;
  status: string;
};

type ImportField =
  | "name"
  | "headline"
  | "company"
  | "location"
  | "providerId"
  | "publicIdentifier"
  | "profileUrl"
  | "language"
  | "segment"
  | "signal"
  | "networkDistance";

type ImportSummary = {
  imported: number;
  duplicate: number;
  invalid: number;
  total: number;
  campaignId: string;
};

const FIELD_CONFIG: Array<{ key: ImportField; label: string; required?: boolean }> = [
  { key: "name", label: "Full name", required: true },
  { key: "headline", label: "Headline" },
  { key: "company", label: "Company" },
  { key: "location", label: "Location" },
  { key: "providerId", label: "Provider ID" },
  { key: "publicIdentifier", label: "LinkedIn public identifier" },
  { key: "profileUrl", label: "LinkedIn profile URL" },
  { key: "language", label: "Language" },
  { key: "segment", label: "Segment" },
  { key: "signal", label: "Signal source text" },
  { key: "networkDistance", label: "Network distance" },
];

const AUTO_MAP: Partial<Record<ImportField, string[]>> = {
  name: ["name", "full name", "fullname"],
  headline: ["headline", "title", "job title"],
  company: ["company", "organization", "org"],
  location: ["location", "city", "country"],
  providerId: ["provider id", "providerid", "member id", "member_id", "id"],
  publicIdentifier: ["public identifier", "publicidentifier", "linkedin id", "linkedin_handle"],
  profileUrl: ["profile url", "linkedin url", "linkedin profile", "url"],
  language: ["language", "lang"],
  segment: ["segment", "list", "audience"],
  signal: ["signal", "source", "reason"],
  networkDistance: ["network distance", "distance"],
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function parseCsv(text: string): { headers: string[]; rows: Array<Record<string, string>> } {
  const records: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "\"") {
      if (inQuotes && text[i + 1] === "\"") {
        field += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      current.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      current.push(field);
      field = "";
      if (current.some((value) => value.trim().length > 0)) {
        records.push(current);
      }
      current = [];
      continue;
    }

    field += char;
  }

  if (field.length > 0 || current.length > 0) {
    current.push(field);
    if (current.some((value) => value.trim().length > 0)) {
      records.push(current);
    }
  }

  if (records.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = records[0].map((value, index) => value.trim() || `column_${index + 1}`);
  const rows = records.slice(1).map((entry) => {
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (entry[index] || "").trim();
    });
    return row;
  });

  return { headers, rows };
}

function inferMappings(headers: string[]): Record<string, string> {
  const next: Record<string, string> = {};
  for (const field of FIELD_CONFIG) {
    const synonyms = AUTO_MAP[field.key] || [];
    const hit = headers.find((header) => {
      const normalized = normalizeHeader(header);
      return synonyms.some((syn) => normalized === syn || normalized.includes(syn));
    });
    if (hit) next[field.key] = hit;
  }
  return next;
}

export function CsvImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (summary: ImportSummary) => void;
}) {
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [fileName, setFileName] = useState("");
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [segment, setSegment] = useState("");
  const [language, setLanguage] = useState<"en" | "it">("en");
  const [signalText, setSignalText] = useState("Imported from CSV");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const response = await fetch("/api/campaigns");
        const body = await response.json().catch(() => ({}));
        const nextCampaigns = (body.campaigns || []) as CampaignOption[];
        setCampaigns(nextCampaigns);
        if (!campaignId && nextCampaigns.length > 0) {
          const active = nextCampaigns.find((item) => item.status === "active");
          setCampaignId(active?.id || nextCampaigns[0].id);
        }
      } catch {
        setCampaigns([]);
      }
    })();
  }, [open, campaignId]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setInfo(null);
      setBusy(false);
    }
  }, [open]);

  const previewRows = useMemo(() => rows.slice(0, 5), [rows]);

  async function handleFileChange(file: File | null) {
    if (!file) return;
    setError(null);
    setInfo(null);
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.headers.length === 0) {
      setHeaders([]);
      setRows([]);
      setMappings({});
      setError("No CSV data detected.");
      return;
    }
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMappings(inferMappings(parsed.headers));
  }

  async function submitImport() {
    if (rows.length === 0) {
      setError("Upload a CSV file first.");
      return;
    }
    if (!campaignId) {
      setError("Select a campaign for imported contacts.");
      return;
    }
    if (!mappings.name) {
      setError("Map at least the Full name column.");
      return;
    }
    if (!mappings.providerId && !mappings.publicIdentifier && !mappings.profileUrl) {
      setError("Map Provider ID, Public Identifier, or LinkedIn profile URL.");
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          rows,
          mappings,
          defaults: {
            segment: segment || undefined,
            language,
            signal: signalText || undefined,
          },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "CSV import failed");
      }
      const summary: ImportSummary = {
        imported: body.imported || 0,
        duplicate: body.duplicate || 0,
        invalid: body.invalid || 0,
        total: body.total || rows.length,
        campaignId: body.campaignId || campaignId,
      };
      setInfo(`Import complete: ${summary.imported} imported, ${summary.duplicate} duplicates, ${summary.invalid} invalid.`);
      onImported(summary);
      onOpenChange(false);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "CSV import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Import contacts from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV, map columns dynamically, and import leads into a campaign.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <label className="block text-xs uppercase tracking-[0.16em] text-muted-foreground">CSV file</label>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => { void handleFileChange(event.target.files?.[0] || null); }}
              className="mt-2"
            />
            {fileName ? <p className="mt-2 text-xs text-muted-foreground">Loaded: {fileName}</p> : null}
          </div>

          {headers.length > 0 && (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Campaign</span>
                  <select
                    value={campaignId}
                    onChange={(event) => setCampaignId(event.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  >
                    {campaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name} ({campaign.status})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Default segment</span>
                  <Input value={segment} onChange={(event) => setSegment(event.target.value)} placeholder="Imported list" />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Default language</span>
                  <select
                    value={language}
                    onChange={(event) => setLanguage(event.target.value === "it" ? "it" : "en")}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  >
                    <option value="en">English</option>
                    <option value="it">Italian</option>
                  </select>
                </label>
              </div>

              <label className="space-y-1 block">
                <span className="text-xs text-muted-foreground">Default signal text</span>
                <Input
                  value={signalText}
                  onChange={(event) => setSignalText(event.target.value)}
                  placeholder="Imported from CSV"
                />
              </label>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Dynamic column mapping</p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {FIELD_CONFIG.map((field) => (
                    <label key={field.key} className="flex items-center gap-2 text-xs">
                      <span className="min-w-40 text-muted-foreground">
                        {field.label}
                        {field.required ? " *" : ""}
                      </span>
                      <select
                        value={mappings[field.key] || ""}
                        onChange={(event) => setMappings((current) => ({ ...current, [field.key]: event.target.value }))}
                        className="h-8 w-full rounded-lg border border-border bg-background px-2 text-xs"
                      >
                        <option value="">Not mapped</option>
                        {headers.map((header) => (
                          <option key={`${field.key}:${header}`} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Preview ({previewRows.length} rows)</p>
                <div className="mt-2 max-h-48 overflow-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {headers.map((header) => (
                          <th key={header} className="px-2 py-1 text-left text-muted-foreground">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, idx) => (
                        <tr key={`preview-${idx}`} className="border-b border-border/40">
                          {headers.map((header) => (
                            <td key={`${idx}:${header}`} className="px-2 py-1 text-foreground">{row[header] || ""}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
              {info}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { void submitImport(); }} disabled={busy} className="gap-1.5 bg-brand text-white hover:bg-brand-hover">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {busy ? "Importing..." : "Import contacts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
