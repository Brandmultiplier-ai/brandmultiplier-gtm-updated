"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AccountMode = "new" | "existing" | null;

const MIN_PASSWORD_LEN = 8;

function InviteFormInner() {
  const params = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = typeof params.token === "string" ? params.token : params.token?.[0] ?? "";

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [accountMode, setAccountMode] = useState<AccountMode>(null);
  const [checkingAccount, setCheckingAccount] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const checkSeq = useRef(0);

  useEffect(() => {
    const fromQuery = searchParams.get("email")?.trim();
    if (fromQuery) setEmail(fromQuery);
  }, [searchParams]);

  useEffect(() => {
    if (!token) return;
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setAccountMode(null);
      setInviteError(null);
      setCheckingAccount(false);
      return;
    }

    const seq = ++checkSeq.current;
    const ac = new AbortController();
    const t = setTimeout(async () => {
      setCheckingAccount(true);
      setInviteError(null);
      try {
        const res = await fetch("/api/workspaces/invites/check-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, email: trimmed }),
          signal: ac.signal,
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          accountExists?: boolean;
          error?: string;
        };
        if (seq !== checkSeq.current) return;
        if (!res.ok) {
          setAccountMode(null);
          setInviteError(data.error || "Invalid or expired invite");
          return;
        }
        setInviteError(null);
        setAccountMode(data.accountExists ? "existing" : "new");
      } catch {
        if (ac.signal.aborted || seq !== checkSeq.current) return;
        setAccountMode(null);
        setInviteError("Could not verify invite. Check your connection and try again.");
      } finally {
        if (seq === checkSeq.current) setCheckingAccount(false);
      }
    }, 450);

    return () => {
      ac.abort();
      clearTimeout(t);
    };
  }, [email, token]);

  useEffect(() => {
    setPassword("");
    setPasswordConfirm("");
    setError(null);
  }, [accountMode]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!accountMode) {
      setError("Enter a valid email address and wait for the form to detect whether this is a new or existing account.");
      return;
    }
    if (accountMode === "new") {
      if (password.length < MIN_PASSWORD_LEN) {
        setError(`Password must be at least ${MIN_PASSWORD_LEN} characters.`);
        return;
      }
      if (password !== passwordConfirm) {
        setError("Passwords do not match.");
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch("/api/workspaces/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          token,
          email: email.trim(),
          password,
          passwordConfirm: accountMode === "new" ? passwordConfirm : undefined,
          displayName: displayName.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
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
        className="w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-8 shadow-lg ring-1 ring-foreground/5"
      >
        <div>
          <h1 className="text-xl font-semibold text-foreground">Join workspace</h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Use the same email your admin invited. If you are new here, you will create a password. If you already have a
            BrandMultiplier login, enter your existing password to add this workspace to your account.
          </p>
        </div>

        {inviteError ? <p className="text-sm text-destructive">{inviteError}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Name</label>
          <Input
            className="h-10 rounded-lg"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="name"
            placeholder="Your name"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Email</label>
          <Input
            type="email"
            className="h-10 rounded-lg"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            placeholder="you@company.com"
          />
          {checkingAccount ? (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin shrink-0" />
              Checking your account…
            </p>
          ) : accountMode === "new" ? (
            <p className="text-xs text-success">No account for this email yet — you will create a password below.</p>
          ) : accountMode === "existing" ? (
            <p className="text-xs text-muted-foreground">
              This email already has an account — enter your existing password (the one you use to sign in today).
            </p>
          ) : email.trim() ? (
            <p className="text-xs text-muted-foreground">Enter a valid email to continue.</p>
          ) : null}
        </div>

        {accountMode === "existing" ? (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Your password</label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                className="h-10 rounded-lg pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="Existing account password"
              />
              <button
                type="button"
                tabIndex={-1}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
        ) : null}

        {accountMode === "new" ? (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Create password</label>
              <p className="text-xs text-muted-foreground">
                At least {MIN_PASSWORD_LEN} characters. This becomes your sign-in password for BrandMultiplier.
              </p>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  className="h-10 rounded-lg pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  placeholder="Create a password"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Confirm password</label>
              <div className="relative">
                <Input
                  type={showPasswordConfirm ? "text" : "password"}
                  className="h-10 rounded-lg pr-10"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  placeholder="Repeat password"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setShowPasswordConfirm((s) => !s)}
                  aria-label={showPasswordConfirm ? "Hide confirm password" : "Show confirm password"}
                >
                  {showPasswordConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
          </>
        ) : null}

        <Button
          type="submit"
          disabled={loading || !accountMode || !!inviteError}
          className="h-11 w-full rounded-lg font-medium"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          {loading ? "Joining…" : "Join workspace"}
        </Button>
      </form>
    </div>
  );
}

export function InviteForm() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
        </div>
      }
    >
      <InviteFormInner />
    </Suspense>
  );
}
