import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { AppGlobalRole } from "@/lib/types";

const ALG = "HS256" as const;

function getSessionSecretKey(): Uint8Array {
  const raw = process.env.BM_GTM_SESSION_SECRET?.trim() || "brandmultiplier-gtm-dev-insecure-dev-only-secret-change";
  if (process.env.NODE_ENV === "production" && !process.env.BM_GTM_SESSION_SECRET?.trim()) {
    throw new Error("Missing BM_GTM_SESSION_SECRET in production");
  }
  return new TextEncoder().encode(raw);
}

export interface SessionTokenPayload extends JWTPayload {
  sub: string;
  email: string;
  typ: "bm_gtm_session";
  /** Platform role; legacy tokens used super_admin without space */
  bm_gr?: AppGlobalRole | "super_admin";
}

const JWT_ISS = "brandmultiplier-gtm" as const;
const JWT_MAX_AGE = 60 * 60 * 24 * 7; // 7d

export async function signSessionToken(
  userId: string,
  email: string,
  globalRole: AppGlobalRole = "member",
): Promise<string> {
  return new SignJWT({
    typ: "bm_gtm_session",
    email,
    bm_gr: globalRole,
  })
    .setProtectedHeader({ alg: ALG })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer(JWT_ISS)
    .setExpirationTime("7d")
    .sign(getSessionSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionTokenPayload> {
  const { payload } = await jwtVerify(token, getSessionSecretKey(), { issuer: JWT_ISS });
  if (typeof payload.sub !== "string" || typeof (payload as SessionTokenPayload).email !== "string") {
    throw new Error("Invalid session token payload");
  }
  if ((payload as SessionTokenPayload).typ !== "bm_gtm_session") {
    throw new Error("Invalid session token type");
  }
  const p = payload as SessionTokenPayload;
  if (
    p.bm_gr !== undefined
    && p.bm_gr !== "super admin"
    && p.bm_gr !== "super_admin"
    && p.bm_gr !== "member"
  ) {
    throw new Error("Invalid session token role");
  }
  return p;
}

export { JWT_MAX_AGE };
