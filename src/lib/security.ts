import type { NextRequest } from "next/server";

function decodeBase64(value: string): string | null {
  try {
    return atob(value);
  } catch {
    return null;
  }
}

export function safeEqual(left?: string | null, right?: string | null): boolean {
  if (typeof left !== "string" || typeof right !== "string") return false;
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let i = 0; i < left.length; i++) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

export function isAuthorizedBasic(
  header: string | null,
  expectedUsername?: string | null,
  expectedPassword?: string | null,
): boolean {
  if (!expectedUsername || !expectedPassword) return true;
  if (!header || !header.startsWith("Basic ")) return false;

  const decoded = decodeBase64(header.slice(6));
  if (!decoded) return false;

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex < 0) return false;

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  return safeEqual(username, expectedUsername) && safeEqual(password, expectedPassword);
}

export function hasSharedSecret(
  req: NextRequest,
  expectedSecret?: string | null,
  options: { headerNames?: string[]; queryNames?: string[] } = {},
): boolean {
  if (!expectedSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (safeEqual(token, expectedSecret)) return true;
  }

  for (const headerName of options.headerNames || []) {
    const value = req.headers.get(headerName)?.trim();
    if (safeEqual(value, expectedSecret)) return true;
  }

  for (const queryName of options.queryNames || []) {
    const value = req.nextUrl.searchParams.get(queryName)?.trim();
    if (safeEqual(value, expectedSecret)) return true;
  }

  return false;
}
