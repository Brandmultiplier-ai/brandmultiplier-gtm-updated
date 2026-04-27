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
  if (r.status === 401 && typeof window !== "undefined" && !String(input).includes("/api/auth/")) {
    const path = window.location.pathname;
    if (path !== "/login") {
      window.location.assign("/login");
    }
  }
  return r;
}
