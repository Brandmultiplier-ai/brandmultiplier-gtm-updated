"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

export function WorkspaceSwitcher() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const hydrateApp = useAppStore((state) => state.hydrateApp);
  const workspaces = useAppStore((state) => state.workspaces);
  const active = useAppStore((state) => state.activeWorkspaceId);
  const loading = useAppStore((state) => state.workspaceStatus === "loading");
  const selectWorkspace = useAppStore((state) => state.selectWorkspace);

  useEffect(() => {
    void hydrateApp();
  }, [hydrateApp]);

  const current = workspaces.find((w) => w.id === active) || workspaces[0];

  async function select(id: string) {
    setOpen(false);
    const ok = await selectWorkspace(id);
    if (ok) {
      router.refresh();
    }
  }

  if (loading && workspaces.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">…</div>
    );
  }

  if (workspaces.length === 0) {
    return null;
  }

  return (
    <div className="relative border-b border-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm",
          "hover:bg-muted/40 rounded-lg transition-colors",
        )}
      >
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate font-medium">
          {current?.name || "Workspace"}
        </span>
        <ChevronsUpDown className="size-3.5 text-muted-foreground" />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-0.5 rounded-md border border-border bg-popover p-1 shadow-md">
          {workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => void select(w.id)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted/60"
            >
              <span className="flex-1 truncate">{w.name}</span>
              {w.id === active ? <Check className="size-3.5" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
