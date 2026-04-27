import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const envPath = join(ROOT, ".env.local");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^(\w+)=(.+)$/);
    if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

type WebhookRecord = {
  id?: string;
  name?: string;
  source?: string;
  request_url?: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function api(path: string, init?: RequestInit) {
  const baseUrl = required("UNIPILE_BASE_URL");
  const apiKey = required("UNIPILE_API_KEY");
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "X-API-KEY": apiKey,
      ...(init?.headers || {}),
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Unipile ${path} failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  const accountId = required("UNIPILE_ACCOUNT_ID");
  const appUrl = (process.env.BM_GTM_APP_URL || "https://brandmultiplier-gtm.vercel.app").replace(/\/$/, "");
  const webhookSecret = required("BM_GTM_WEBHOOK_SECRET");
  const requestUrl = `${appUrl}/api/webhooks`;

  const existingResponse = await api(`/webhooks?account_id=${encodeURIComponent(accountId)}`);
  const existing = (existingResponse.items || existingResponse.data || existingResponse || []) as WebhookRecord[];
  const managedHooks = existing.filter((webhook) => webhook.name?.startsWith("brandmultiplier-gtm-"));

  for (const webhook of managedHooks) {
    if (!webhook.id) continue;
    await api(`/webhooks/${webhook.id}`, { method: "DELETE" });
  }

  const headers = [
    { key: "Content-Type", value: "application/json" },
    { key: "Unipile-Auth", value: webhookSecret },
  ];

  const createdUsers = await api("/webhooks", {
    method: "POST",
    body: JSON.stringify({
      source: "users",
      request_url: requestUrl,
      name: "brandmultiplier-gtm-connections",
      headers,
    }),
  });

  const createdMessaging = await api("/webhooks", {
    method: "POST",
    body: JSON.stringify({
      source: "messaging",
      request_url: requestUrl,
      name: "brandmultiplier-gtm-messages",
      headers,
    }),
  });

  console.log(JSON.stringify({
    ok: true,
    requestUrl,
    deleted: managedHooks.map((webhook) => webhook.name),
    created: [
      createdUsers.id || createdUsers.name || "brandmultiplier-gtm-connections",
      createdMessaging.id || createdMessaging.name || "brandmultiplier-gtm-messages",
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
