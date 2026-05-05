import { createHash, randomBytes } from "crypto";

export function createInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isInviteUsable(invite: { expiresAt: string; acceptedAt?: string }): boolean {
  return !invite.acceptedAt && Date.parse(invite.expiresAt) > Date.now();
}
