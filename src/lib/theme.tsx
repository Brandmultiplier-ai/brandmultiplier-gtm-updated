"use client";

import { useEffect, type ReactNode } from "react";

/**
 * BrandMultiplier GTM is dark-only (matches brandmultiplier.ai). Keeps <html class="dark"> in sync.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const el = document.documentElement;
    el.classList.remove("light");
    el.classList.add("dark");
    el.style.colorScheme = "dark";
  }, []);
  return <>{children}</>;
}
