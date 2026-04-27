export const BM_GTM_SESSION_COOKIE = "bm_gtm_session";
export const BM_GTM_ACTIVE_WORKSPACE_COOKIE = "bm_gtm_active_workspace";

/** Cookie options for httpOnly session + workspace selection */
export const sessionCookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
};
