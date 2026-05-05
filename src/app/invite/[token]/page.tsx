"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/workspaces/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          token: params.token,
          email,
          password,
          displayName: displayName || undefined,
        }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Invite could not be accepted");
        return;
      }
      router.push("/settings?tab=account");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-8"
      >
        <div>
          <h1 className="text-xl font-semibold">Join workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with an existing account or create a new one to join this workspace only.
          </p>
        </div>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <label className="block text-sm">
          <span className="text-muted-foreground">Name</span>
          <input
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="name"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Email</span>
          <input
            type="email"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Password</span>
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2 font-medium text-primary-foreground"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          Join workspace
        </button>
      </form>
    </div>
  );
}
