export interface UnipileClientOptions {
  apiKey?: string;
  baseUrl?: string;
  accountId?: string;
}

export interface GetProfileOptions {
  linkedinSections?: string;
}

function env(overrides?: UnipileClientOptions) {
  return {
    apiKey: overrides?.apiKey || process.env.UNIPILE_API_KEY!,
    baseUrl: overrides?.baseUrl || process.env.UNIPILE_BASE_URL!,
    accountId: overrides?.accountId || process.env.UNIPILE_ACCOUNT_ID!,
  };
}

export type InviteResponseKind =
  | "success"
  | "already_invited"
  | "provider_limit"
  | "rate_limited"
  | "error";

export interface InviteResponseClassification {
  kind: InviteResponseKind;
  isError: boolean;
  httpStatus?: number;
  message?: string;
}

async function api(path: string, opts?: RequestInit, client?: UnipileClientOptions) {
  const { apiKey, baseUrl, accountId } = env(client);
  const isFormData = typeof FormData !== "undefined" && opts?.body instanceof FormData;
  const headers = {
    "X-API-KEY": apiKey,
    accept: "application/json",
    ...(isFormData ? {} : { "content-type": "application/json" }),
  };
  const sep = path.includes("?") ? "&" : "?";
  const url = `${baseUrl}/api/v1${path}${sep}account_id=${accountId}`;
  const res = await fetch(url, { ...opts, headers: { ...headers, ...opts?.headers } });
  const body = await res.json();
  // Preserve HTTP status in the response so callers can check it
  if (!res.ok && !body.status) {
    body.status = res.status;
  }
  body._httpStatus = res.status;
  return body;
}

async function directApi(path: string, opts?: RequestInit, client?: UnipileClientOptions) {
  const { apiKey, baseUrl } = env(client);
  const isFormData = typeof FormData !== "undefined" && opts?.body instanceof FormData;
  const headers = {
    "X-API-KEY": apiKey,
    accept: "application/json",
    ...(isFormData ? {} : { "content-type": "application/json" }),
  };
  const res = await fetch(`${baseUrl}/api/v1${path}`, { ...opts, headers: { ...headers, ...opts?.headers } });
  const body = await res.json();
  if (!res.ok && !body.status) {
    body.status = res.status;
  }
  body._httpStatus = res.status;
  return body;
}

export async function searchPosts(keywords: string, datePeriod?: string, client?: UnipileClientOptions) {
  return api("/linkedin/search", {
    method: "POST",
    body: JSON.stringify({
      api: "classic",
      category: "posts",
      keywords,
      sort_by: "date",
      ...(datePeriod && { date_posted: datePeriod }),
    }),
  }, client);
}

export async function searchPeople(keywords: string, titleKeywords?: string, start = 0, client?: UnipileClientOptions) {
  const res = await api("/linkedin/search", {
    method: "POST",
    body: JSON.stringify({
      api: "classic",
      category: "people",
      keywords,
      start,
      ...(titleKeywords && { advanced_keywords: { title: titleKeywords } }),
    }),
  }, client);
  return res.items || res.data || [];
}

export async function getProfile(
  identifier: string,
  client?: UnipileClientOptions,
  options?: GetProfileOptions,
) {
  const params = new URLSearchParams();
  if (options?.linkedinSections) {
    params.set("linkedin_sections", options.linkedinSections);
  }
  const suffix = params.toString();
  return api(`/users/${encodeURIComponent(identifier)}${suffix ? `?${suffix}` : ""}`, undefined, client);
}

export async function getAccount(accountId: string, client?: UnipileClientOptions) {
  return directApi(`/accounts/${accountId}`, undefined, client);
}

export async function getLinkedInCompanyProfile(identifier: string, client?: UnipileClientOptions) {
  return api(`/linkedin/company/${encodeURIComponent(identifier)}`, undefined, client);
}

export async function getPostsByAuthor(authorId: string, client?: UnipileClientOptions) {
  return api("/linkedin/search", {
    method: "POST",
    body: JSON.stringify({
      api: "classic",
      category: "posts",
      posted_by: { member: [authorId] },
      sort_by: "date",
    }),
  }, client);
}

export async function getPostsByCompany(companyId: string, client?: UnipileClientOptions) {
  return api("/linkedin/search", {
    method: "POST",
    body: JSON.stringify({
      api: "classic",
      category: "posts",
      posted_by: { company: [companyId] },
      sort_by: "date",
    }),
  }, client);
}

export async function sendInvite(providerId: string, message: string, client?: UnipileClientOptions) {
  const current = env(client);
  return api("/users/invite", {
    method: "POST",
    body: JSON.stringify({
      provider_id: providerId,
      account_id: current.accountId,
      message,
    }),
  }, client);
}

function inviteResponseText(result: Record<string, unknown>): string {
  return [result.type, result.title, result.detail, result.message]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
}

export function classifyInviteResponse(result: Record<string, unknown>): InviteResponseClassification {
  const httpStatus = typeof result._httpStatus === "number"
    ? result._httpStatus
    : typeof result.status === "number"
      ? result.status
      : undefined;
  const type = typeof result.type === "string" ? result.type.toLowerCase() : "";
  const detail = typeof result.detail === "string"
    ? result.detail
    : typeof result.title === "string"
      ? result.title
      : typeof result.message === "string"
        ? result.message
        : "Unipile invite failed";
  const text = inviteResponseText(result);
  const isError = (typeof httpStatus === "number" && httpStatus >= 400) || type.startsWith("errors/");

  if (!isError) {
    return { kind: "success", isError: false, httpStatus };
  }

  const isProviderLimit = text.includes("temporary provider limit") ||
    text.includes("provider limit") ||
    type.includes("cannot_resend_yet");

  if (isProviderLimit) {
    return {
      kind: "provider_limit",
      isError: true,
      httpStatus,
      message: detail,
    };
  }

  const isAlreadyInvited = type.includes("already_invited") ||
    (type.includes("cannot_resend") &&
      !type.includes("cannot_resend_yet") &&
      !text.includes("try again later"));

  if (isAlreadyInvited) {
    return {
      kind: "already_invited",
      isError: true,
      httpStatus,
      message: detail,
    };
  }

  const isRateLimited = type.includes("rate_limit") ||
    text.includes("rate limit") ||
    text.includes("too many");

  if (isRateLimited) {
    return {
      kind: "rate_limited",
      isError: true,
      httpStatus,
      message: detail,
    };
  }

  return {
    kind: "error",
    isError: true,
    httpStatus,
    message: detail,
  };
}

export async function sendMessage(chatId: string, text: string, client?: UnipileClientOptions) {
  return api(`/chats/${chatId}/messages`, {
    method: "POST",
    body: JSON.stringify({ text }),
  }, client);
}

export async function getChat(chatId: string, client?: UnipileClientOptions) {
  return api(`/chats/${chatId}`, undefined, client);
}

export async function getChatMessages(chatId: string, limit = 50, client?: UnipileClientOptions) {
  return api(`/chats/${chatId}/messages?limit=${limit}`, undefined, client);
}

export async function startChat(providerIds: string[], client?: UnipileClientOptions) {
  const current = env(client);
  return api("/chats", {
    method: "POST",
    body: JSON.stringify({
      attendees_ids: providerIds,
      account_id: current.accountId,
    }),
  }, client);
}

export async function getOrCreateChat(providerId: string, client?: UnipileClientOptions): Promise<string | null> {
  // Try to start a new chat — Unipile returns existing chat if one exists
  const res = await startChat([providerId], client);
  if (res?.object_chat_id || res?.chat_id || res?.id) {
    return res.object_chat_id || res.chat_id || res.id;
  }
  return null;
}

export async function listChats(client?: UnipileClientOptions) {
  return api("/chats", undefined, client);
}

export async function listWebhooks(client?: UnipileClientOptions) {
  return api("/webhooks", undefined, client);
}

// ── Post engagement ─────────────────────────────────────────────────

export async function getPostComments(postId: string, client?: UnipileClientOptions) {
  const encoded = encodeURIComponent(postId);
  return api(`/posts/${encoded}/comments`, undefined, client);
}

export async function getPostReactions(postId: string, client?: UnipileClientOptions) {
  const encoded = encodeURIComponent(postId);
  return api(`/posts/${encoded}/reactions`, undefined, client);
}

// ── Invitations ─────────────────────────────────────────────────────

export async function listInvitationsSent(client?: UnipileClientOptions) {
  return api("/users/invitations-sent", undefined, client);
}

// ── Relations ───────────────────────────────────────────────────────

export async function listRelations(limit = 50, cursor?: string, client?: UnipileClientOptions) {
  const qs = cursor ? `&cursor=${cursor}` : "";
  return api(`/users/relations?limit=${limit}${qs}`, undefined, client);
}

// ── Raw LinkedIn endpoint (proxy) ───────────────────────────────────

export async function linkedinRaw(requestUrl: string, client?: UnipileClientOptions) {
  const { apiKey, baseUrl, accountId } = env(client);
  const url = `${baseUrl}/api/v1/linkedin/raw-data`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      account_id: accountId,
      request_url: requestUrl,
    }),
  });
  const body = await res.json();
  if (!res.ok && !body.status) {
    body.status = res.status;
  }
  body._httpStatus = res.status;
  return body;
}

/** Get profile visitors via LinkedIn's internal wvmpCards endpoint */
export async function getProfileVisitors() {
  return linkedinRaw("https://www.linkedin.com/voyager/api/identity/wvmpCards");
}

// ── Followers ───────────────────────────────────────────────────────

export async function listFollowers(limit = 50, cursor?: string, client?: UnipileClientOptions) {
  const qs = cursor ? `&cursor=${cursor}` : "";
  return api(`/users/followers?limit=${limit}${qs}`, undefined, client);
}

// ── Company ─────────────────────────────────────────────────────────

export async function getCompanyProfile(companyId: string, client?: UnipileClientOptions) {
  return api(`/linkedin/companies/${companyId}`, undefined, client);
}

export async function listAllRelations(maxPages = 5, client?: UnipileClientOptions): Promise<unknown[]> {
  const all: unknown[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const res = await listRelations(50, cursor, client);
    const items = res.items || res.data || [];
    if (items.length === 0) break;
    all.push(...items);
    cursor = res.cursor || res.next_cursor;
    if (!cursor) break;
  }
  return all;
}
