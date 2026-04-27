"use client";

import { cn } from "@/lib/utils";

function BrandIconMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl border border-foreground/10 bg-foreground/[0.04] text-foreground shrink-0",
        "shadow-[0_0_20px_rgba(139,92,246,0.15)] dark:shadow-[0_0_24px_rgba(139,92,246,0.2)]",
        "size-9",
        className
      )}
      aria-hidden
    >
      <span className="relative font-ui font-bold leading-none tracking-tight text-[16px]">
        <span className="lowercase">b</span>
        <sup className="ml-[0.5px] text-[0.5em] font-semibold top-[-0.35em]">x</sup>
      </span>
    </div>
  );
}

function BrandWordmark() {
  return (
    <div className="overflow-hidden min-w-0">
      <p className="font-ui text-[14px] font-bold tracking-[-0.02em] leading-tight whitespace-nowrap text-foreground">
        <span className="font-bold">Brand</span>
        <span className="bg-gradient-to-r from-violet-500 via-fuchsia-500 to-indigo-500 bg-clip-text text-transparent">
          Multiplier
        </span>
      </p>
      <p className="text-[8px] font-medium uppercase tracking-[0.16em] text-muted-foreground mt-0.5">Narrative GTM</p>
    </div>
  );
}

type BrandLogoBlockProps = {
  collapsed: boolean;
  className?: string;
};

export function BrandLogoBlock({ collapsed, className }: BrandLogoBlockProps) {
  if (collapsed) {
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <BrandIconMark />
      </div>
    );
  }
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <BrandIconMark />
      <BrandWordmark />
    </div>
  );
}
