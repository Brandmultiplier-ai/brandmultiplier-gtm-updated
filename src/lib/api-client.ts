/**
 * Browser fetch for BrandMultiplier GTM API with session cookies.
 */
export async function apiFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const r = await fetch(input, {
    ...init,
    credentials: "include",
  });
  if (r.status === 401 && typeof window !== "undefined") {
    const url = String(input);
    // Avoid redirect loop on login/bootstrap; other /api/auth/* (e.g. me) should send user to login
    const skipRedirect = /\/api\/auth\/(login|logout|bootstrap)/.test(url);
    const path = window.location.pathname;
    if (!skipRedirect && path !== "/login") {
      window.location.assign("/login");
    }
  }
  return r;
}
