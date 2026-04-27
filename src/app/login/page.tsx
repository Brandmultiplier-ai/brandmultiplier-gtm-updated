"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bootstrap, setBootstrap] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null);

  useEffect(() => {
    void fetch("/api/auth/bootstrap-status", { credentials: "include" })
      .then((r) => r.json() as Promise<{ needsBootstrap?: boolean }>)
      .then((j) => setNeedsBootstrap(Boolean(j.needsBootstrap)))
      .catch(() => setNeedsBootstrap(true));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, secret: bootstrap || undefined }),
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-background">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-8"
      >
        <div>
          <h1 className="text-xl font-semibold">Sign in to BrandMultiplier GTM</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage outreach, copilot workflows, and relationship pipelines from one BrandMultiplier workspace.
            {needsBootstrap ? (
              <>
                {" "}
                First-time setup: set <code>BM_GTM_BOOTSTRAP_SECRET</code> on the server and enter the same value
                below (only while there are no users yet).
              </>
            ) : null}
          </p>
        </div>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <label className="block text-sm">
          <span className="text-muted-foreground">Email</span>
          <input
            type="email"
            autoComplete="email"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {needsBootstrap ? (
          <label className="block text-sm">
            <span className="text-muted-foreground">Bootstrap secret (first user only)</span>
            <input
              type="password"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              value={bootstrap}
              onChange={(e) => setBootstrap(e.target.value)}
              autoComplete="off"
            />
          </label>
        ) : null}
        <button
          type="submit"
          disabled={loading || needsBootstrap === null}
          className="w-full flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground py-2 font-medium"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          Continue
        </button>
      </form>
    </div>
  );
}
