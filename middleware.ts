import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedBasic } from "@/lib/security";

const PUBLIC_PREFIXES = [
  "/_next",
  "/_vercel",
  "/api/webhooks",
  "/api/cron/run",
  "/login",
  "/invite",
  "/api/auth",
  "/api/workspaces/invites/accept",
];
const PUBLIC_FILES = /\.(?:css|gif|ico|jpg|jpeg|js|map|png|svg|txt|webp|woff|woff2|xml)$/i;

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  if (pathname === "/favicon.ico" || pathname === "/robots.txt" || pathname === "/sitemap.xml") return true;
  return PUBLIC_FILES.test(pathname);
}

export function middleware(req: NextRequest) {
  if (isPublicPath(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const username = process.env.BM_GTM_BASIC_AUTH_USER?.trim();
  const password = process.env.BM_GTM_BASIC_AUTH_PASSWORD?.trim();

  if (isAuthorizedBasic(req.headers.get("authorization"), username, password)) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="BrandMultiplier GTM", charset="UTF-8"',
    },
  });
}

export const config = {
  matcher: ["/:path*"],
};
