"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

function slugifyName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "workspace";
}

type CreateModalVariant = "empty" | "main";

function CreateWorkspaceModal(props: {
  open: boolean;
  variant: CreateModalVariant;
  newName: string;
  onNameChange: (v: string) => void;
  createError: string | null;
  createSaving: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { open, variant, newName, onNameChange, createError, createSaving, onClose, onSubmit } = props;
  if (!open) return null;
  const intro =
    variant === "empty"
      ? "Only platform super administrators can create workspaces. Workspace admins and members join via invite."
      : "Only you (platform super admin) can create workspaces. Workspace admins and invited members never see this control.";
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h4 className="text-sm font-semibold text-foreground">New workspace</h4>
        <p className="text-[11px] text-stone mt-1">{intro}</p>
        <label className="mt-4 block text-sm">
          <span className="text-[11px] text-muted-foreground">Name</span>
          <input
            value={newName}
            onChange={(e) => onNameChange(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        {createError ? <p className="mt-2 text-xs text-destructive">{createError}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/40"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={createSaving}
            onClick={() => void onSubmit()}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {createSaving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WorkspaceSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createVariant, setCreateVariant] = useState<CreateModalVariant>("main");
  const [newName, setNewName] = useState("New workspace");
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const hydrateApp = useAppStore((state) => state.hydrateApp);
  const user = useAppStore((state) => state.user);
  const workspaces = useAppStore((state) => state.workspaces);
  const active = useAppStore((state) => state.activeWorkspaceId);
  const superAdmin = useAppStore((state) => state.superAdmin);
  const loading = useAppStore((state) => state.workspaceStatus === "loading");
  const selectWorkspace = useAppStore((state) => state.selectWorkspace);
  const refreshWorkspaces = useAppStore((state) => state.refreshWorkspaces);

  const canCreateWorkspace = user?.globalRole === "super admin" || superAdmin;

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

  async function createWorkspace() {
    const name = newName.trim() || "New workspace";
    setCreateSaving(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          slug: slugifyName(name),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; workspace?: { id: string } };
      if (!res.ok) {
        throw new Error(body.error || "Could not create workspace");
      }
      setCreateOpen(false);
      setNewName("New workspace");
      await refreshWorkspaces();
      if (body.workspace?.id) {
        await selectWorkspace(body.workspace.id);
        router.refresh();
      }
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreateSaving(false);
    }
  }

  function openCreateModal(variant: CreateModalVariant, suggestedName: string) {
    setCreateVariant(variant);
    setNewName(suggestedName);
    setCreateOpen(true);
    setCreateError(null);
    setOpen(false);
  }

  const createModal = (
    <CreateWorkspaceModal
      open={createOpen}
      variant={createVariant}
      newName={newName}
      onNameChange={setNewName}
      createError={createError}
      createSaving={createSaving}
      onClose={() => setCreateOpen(false)}
      onSubmit={createWorkspace}
    />
  );

  if (loading && workspaces.length === 0) {
    return (
      <>
        <div className={cn("text-xs text-muted-foreground", collapsed ? "py-2 text-center" : "px-3 py-2")}>…</div>
        {createModal}
      </>
    );
  }

  if (workspaces.length === 0) {
    if (!canCreateWorkspace) {
      return (
        <>
          <div
            className={cn(
              "text-[11px] leading-snug text-muted-foreground border-b border-border",
              collapsed ? "px-1 py-2 text-center" : "px-3 py-2.5",
            )}
            title="No workspace assigned"
          >
            {collapsed ? <Building2 className="mx-auto size-5 opacity-35" aria-hidden /> : "No workspace assigned. Ask your administrator for an invite link."}
          </div>
          {createModal}
        </>
      );
    }
    return (
      <>
        <div className={cn("border-b border-border space-y-2", collapsed ? "px-1 py-2 flex flex-col items-center" : "px-2 py-2")}>
          {!collapsed ? (
            <p className="text-[11px] text-stone px-1">
              No workspaces yet. Create one (super admin only), then invite teammates from Settings → Organization.
            </p>
          ) : (
            <p className="sr-only">No workspace yet. Super admin: create workspace.</p>
          )}
          <button
            type="button"
            title="Create workspace (super admin only)"
            onClick={() => openCreateModal("empty", "BrandMultiplier")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 text-xs font-medium text-foreground hover:bg-orange-500/15",
              collapsed ? "size-10 p-0" : "w-full px-3 py-2",
            )}
          >
            <Plus className="size-4 text-orange-400 shrink-0" />
            {!collapsed ? "Create workspace" : null}
          </button>
        </div>
        {createModal}
      </>
    );
  }

  if (collapsed) {
    return (
      <>
        <div className="relative border-b border-border flex flex-col items-center gap-1 py-2 px-1">
          <button
            type="button"
            title={`${current?.name || "Workspace"} — switch workspace`}
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className={cn(
              "flex size-10 items-center justify-center rounded-lg border border-border/80",
              "text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors",
            )}
          >
            <Building2 className="size-5" />
          </button>
          {canCreateWorkspace ? (
            <button
              type="button"
              title="Create workspace (super admin only)"
              aria-label="Create workspace (super admin only)"
              onClick={() => openCreateModal("main", "New workspace")}
              className={cn(
                "flex size-10 items-center justify-center rounded-lg border border-orange-500/25",
                "bg-orange-500/10 text-orange-400 hover:bg-orange-500/18 transition-colors",
              )}
            >
              <Plus className="size-4" />
            </button>
          ) : null}
          {open ? (
            <div className="absolute left-full top-0 z-50 ml-1 min-w-[200px] rounded-md border border-border bg-popover p-1 shadow-md">
              {workspaces.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => void select(w.id)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted/60"
                >
                  <span className="flex-1 truncate">{w.name}</span>
                  {w.id === active ? <Check className="size-3.5 shrink-0" /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {createModal}
      </>
    );
  }

  return (
    <div className="relative border-b border-border">
      <div className="flex items-stretch gap-0.5 pr-1">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={cn(
            "min-w-0 flex-1 flex items-center gap-2 px-3 py-2.5 text-left text-sm",
            "hover:bg-muted/40 rounded-lg transition-colors",
          )}
        >
          <Building2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate font-medium">
            {current?.name || "Workspace"}
            {canCreateWorkspace ? (
              <span className="ml-1.5 align-middle text-[9px] font-semibold uppercase tracking-wider text-orange-400">
                super admin
              </span>
            ) : null}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
        {canCreateWorkspace ? (
          <button
            type="button"
            title="Create workspace (super admin only)"
            aria-label="Create workspace (super admin only)"
            onClick={() => openCreateModal("main", "New workspace")}
            className={cn(
              "my-1.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-orange-500/25",
              "bg-orange-500/10 text-orange-400 hover:bg-orange-500/18 transition-colors",
            )}
          >
            <Plus className="size-4" />
          </button>
        ) : null}
      </div>
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
      {createModal}
    </div>
  );
}
