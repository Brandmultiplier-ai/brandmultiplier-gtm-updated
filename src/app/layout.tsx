import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { ThemeProvider } from "@/lib/theme";

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "BrandMultiplier GTM",
  description:
    "BrandMultiplier GTM brings outreach, copilot workflows, and pipeline visibility into one workspace.",
  openGraph: {
    title: "BrandMultiplier GTM",
    description: "Outreach, relationship intelligence, and GTM workflows in one BrandMultiplier workspace.",
    siteName: "BrandMultiplier",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${inter.variable} antialiased bg-background text-foreground`}
        style={{ colorScheme: "dark" }}
      >
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
