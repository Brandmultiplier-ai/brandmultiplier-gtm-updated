"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Brain,
  FlaskConical,
  Send,
  Activity,
  Users,
  Target,
  BarChart3,
  Settings,
  ChevronRight,
  Sparkles,
  Inbox,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogoBlock } from "@/components/brand-logo";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const mainNav: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/copilot", label: "Copilot", icon: Sparkles, badge: "New" },
  { href: "/agent", label: "AI Agent", icon: Brain },
  { href: "/brain", label: "Brain Lab", icon: FlaskConical },
  { href: "/outreach", label: "Outreach", icon: Send },
  { href: "/signals", label: "Signals", icon: Activity },
  { href: "/leads", label: "Contacts", icon: Users },
  { href: "/campaigns", label: "Campaigns", icon: Target },
  { href: "/unibox", label: "Unibox", icon: Inbox },
  { href: "/insights", label: "Insights", icon: BarChart3 },
];

const bottomNav: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useAppStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const seatProfile = useAppStore((state) => state.primarySeat);
  const refreshProfile = useAppStore((state) => state.refreshProfile);
  const signOut = useAppStore((state) => state.signOut);
  const sessionUser = useAppStore((state) => state.user);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const sidebarUserName = seatProfile?.profileName || "BrandMultiplier";
  const sidebarSubLabel = seatProfile?.name || seatProfile?.workspaceId || "Workspace";
  const sidebarInitials = sidebarUserName
    .split(" ")
    .map((chunk) => chunk[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside
      className={cn(
        "bg-card border-r border-border flex flex-col transition-all duration-300 ease-in-out shrink-0",
        collapsed ? "w-[72px]" : "w-[244px]"
      )}
    >
      {/* Logo — BrandMultiplier narrative GTM */}
      <div
        className={cn(
          "border-b border-border",
          collapsed ? "py-5 px-3" : "px-5 py-5"
        )}
      >
        <BrandLogoBlock collapsed={collapsed} />
      </div>

      <div className={cn("border-b border-border", collapsed && "px-0")}>
        <WorkspaceSwitcher collapsed={collapsed} />
      </div>

      {/* Collapse toggle */}
      <div className={cn(
        "px-3 py-2 border-b border-border",
        collapsed && "flex justify-center"
      )}>
        <button
          onClick={toggleSidebar}
          className="size-8 rounded-lg flex items-center justify-center text-stone hover:text-muted-foreground hover:bg-muted/40 transition-colors"
        >
          <ChevronRight
            className={cn(
              "size-4 transition-transform duration-300",
              !collapsed && "rotate-180"
            )}
          />
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
        {mainNav.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                "group relative flex items-center rounded-lg transition-all duration-200",
                collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
                active
                  ? "bg-brand/15 text-brand font-semibold"
                  : "text-stone hover:text-foreground hover:bg-muted/40"
              )}
            >
              <Icon
                className={cn(
                  "shrink-0 transition-colors",
                  collapsed ? "size-5" : "size-[18px]",
                  active ? "text-brand" : "text-stone group-hover:text-foreground"
                )}
              />
              {!collapsed && (
                <span className="font-ui text-[13px] font-medium whitespace-nowrap flex-1">{label}</span>
              )}
              {!collapsed && badge && (
                <span className="text-[9px] font-medium uppercase tracking-wider bg-brand/15 text-brand px-1.5 py-0.5 rounded-full font-ui">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mx-5 border-t border-border" />

      {/* Bottom nav */}
      <div className="px-3 py-3 space-y-1">
        {bottomNav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                "group relative flex items-center rounded-lg transition-all duration-200",
                collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
                active
                  ? "bg-brand/15 text-brand font-semibold"
                  : "text-stone hover:text-foreground hover:bg-muted/40"
              )}
            >
              <Icon
                className={cn(
                  "shrink-0",
                  collapsed ? "size-5" : "size-[18px]",
                  active ? "text-brand" : "text-stone group-hover:text-foreground"
                )}
              />
              {!collapsed && (
                <span className="font-ui text-[13px] font-medium whitespace-nowrap">{label}</span>
              )}
            </Link>
          );
        })}
      </div>

      {/* User avatar + sign out */}
      <div className={cn(
        "border-t border-border py-4 space-y-3",
        collapsed ? "flex flex-col items-center px-3" : "px-4"
      )}>
        <div className={cn(
          "flex items-center w-full",
          collapsed ? "justify-center" : "gap-3"
        )}>
          {seatProfile?.profilePictureUrl ? (
            <img
              src={seatProfile.profilePictureUrl}
              alt={sidebarUserName}
              className="size-9 rounded-full object-cover border border-border shrink-0"
            />
          ) : (
            <div className="size-9 rounded-full bg-gradient-to-br from-brand to-terracotta flex items-center justify-center text-xs font-bold text-white shrink-0 font-ui">
              {sidebarInitials}
            </div>
          )}
          {!collapsed && (
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="font-ui text-xs font-medium text-foreground truncate">{sidebarUserName}</p>
              <p className="font-ui text-[10px] text-stone truncate">{sidebarSubLabel}</p>
              {sessionUser?.email ? (
                <p className="font-ui text-[10px] text-muted-foreground truncate mt-0.5" title={sessionUser.email}>
                  {sessionUser.email}
                </p>
              ) : null}
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size={collapsed ? "icon-sm" : "sm"}
          disabled={loggingOut}
          title="Log out"
          aria-label="Log out"
          className={cn(
            "w-full border-border/90 text-stone hover:text-destructive hover:border-destructive/35 hover:bg-destructive/10 gap-2",
            collapsed && "size-9 p-0",
          )}
          onClick={() => {
            setLoggingOut(true);
            void signOut().finally(() => setLoggingOut(false));
          }}
        >
          <LogOut className="size-3.5 shrink-0" />
          {!collapsed ? <span className="font-ui">{loggingOut ? "Signing out…" : "Log out"}</span> : null}
        </Button>
      </div>
    </aside>
  );
}
