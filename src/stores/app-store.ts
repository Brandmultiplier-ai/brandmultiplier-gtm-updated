"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiFetch } from "@/lib/api-client";

export interface SessionUser {
  id: string;
  email: string;
  displayName?: string;
  profileSettings?: {
    title?: string;
    phone?: string;
    timezone?: string;
  };
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug?: string;
  status?: string;
  niche?: string;
  defaultLanguage?: "it" | "en";
  profileSettings?: {
    companyName?: string;
    website?: string;
    industry?: string;
    size?: string;
    description?: string;
    brandVoice?: string;
  };
}

export interface WorkspaceMembershipSummary {
  userId: string;
  workspaceId: string;
  role: "owner" | "admin" | "operator" | "viewer";
  createdAt: string;
}

export interface SeatProfileSummary {
  id: string;
  name: string;
  workspaceId: string;
  profileName?: string;
  profilePictureUrl?: string;
}

type LoadState = "idle" | "loading" | "ready" | "error";

interface AppStore {
  user: SessionUser | null;
  memberships: WorkspaceMembershipSummary[];
  sessionStatus: LoadState;
  sessionError: string | null;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  workspaceStatus: LoadState;
  workspaceError: string | null;
  primarySeat: SeatProfileSummary | null;
  profileStatus: LoadState;
  profileError: string | null;
  sidebarCollapsed: boolean;
  uniboxSearch: string;
  leadsSearch: string;
  signalsQuery: string;
  hydrateApp: () => Promise<void>;
  refreshSession: () => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  selectWorkspace: (workspaceId: string) => Promise<boolean>;
  refreshProfile: () => Promise<void>;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setUniboxSearch: (value: string) => void;
  setLeadsSearch: (value: string) => void;
  setSignalsQuery: (value: string) => void;
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      user: null,
      memberships: [],
      sessionStatus: "idle",
      sessionError: null,
      workspaces: [],
      activeWorkspaceId: null,
      workspaceStatus: "idle",
      workspaceError: null,
      primarySeat: null,
      profileStatus: "idle",
      profileError: null,
      sidebarCollapsed: false,
      uniboxSearch: "",
      leadsSearch: "",
      signalsQuery: "",

      hydrateApp: async () => {
        await Promise.all([
          get().refreshSession(),
          get().refreshWorkspaces(),
        ]);
        await get().refreshProfile();
      },

      refreshSession: async () => {
        set({ sessionStatus: "loading", sessionError: null });
        try {
          const res = await apiFetch("/api/auth/me");
          if (!res.ok) throw new Error(`Session request failed (${res.status})`);
          const data = await res.json() as {
            user?: SessionUser;
            memberships?: WorkspaceMembershipSummary[];
            activeWorkspaceId?: string | null;
          };
          set({
            user: data.user || null,
            memberships: data.memberships || [],
            activeWorkspaceId: data.activeWorkspaceId || get().activeWorkspaceId,
            sessionStatus: "ready",
            sessionError: null,
          });
        } catch (error) {
          set({ sessionStatus: "error", sessionError: messageFromError(error) });
        }
      },

      refreshWorkspaces: async () => {
        set({ workspaceStatus: "loading", workspaceError: null });
        try {
          const res = await apiFetch("/api/workspaces");
          if (!res.ok) throw new Error(`Workspace request failed (${res.status})`);
          const data = await res.json() as { workspaces?: WorkspaceSummary[] };
          const workspaces = data.workspaces || [];
          set((state) => ({
            workspaces,
            activeWorkspaceId: state.activeWorkspaceId || workspaces[0]?.id || null,
            workspaceStatus: "ready",
            workspaceError: null,
          }));
        } catch (error) {
          set({ workspaceStatus: "error", workspaceError: messageFromError(error) });
        }
      },

      selectWorkspace: async (workspaceId: string) => {
        const res = await apiFetch("/api/workspaces/active", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId }),
        });
        if (!res.ok) return false;
        set({ activeWorkspaceId: workspaceId, primarySeat: null, profileStatus: "idle" });
        await get().refreshProfile();
        return true;
      },

      refreshProfile: async () => {
        set({ profileStatus: "loading", profileError: null });
        try {
          const res = await apiFetch("/api/linkedin-seats");
          if (!res.ok) throw new Error(`Profile request failed (${res.status})`);
          const data = await res.json() as { seats?: SeatProfileSummary[] };
          set({
            primarySeat: data.seats?.[0] || null,
            profileStatus: "ready",
            profileError: null,
          });
        } catch (error) {
          set({ primarySeat: null, profileStatus: "error", profileError: messageFromError(error) });
        }
      },

      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setUniboxSearch: (uniboxSearch) => set({ uniboxSearch }),
      setLeadsSearch: (leadsSearch) => set({ leadsSearch }),
      setSignalsQuery: (signalsQuery) => set({ signalsQuery }),
    }),
    {
      name: "brandmultiplier-gtm:app-store",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        uniboxSearch: state.uniboxSearch,
        leadsSearch: state.leadsSearch,
        signalsQuery: state.signalsQuery,
      }),
    },
  ),
);
