import { existsSync, readFileSync } from "fs";
import { join } from "path";

// Load env BEFORE importing unipile
const ROOT = new URL("..", import.meta.url).pathname;
const envPath = join(ROOT, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^(\w+)=(.+)$/);
    if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const { listAllRelations, listChats } = await import("../src/lib/unipile");
  const store = await import("../src/lib/store");

  const leads = store.getAllLeads({});
  const pending = leads.filter(l => ["invite_sent", "accepted"].includes(l.status));

  console.log("=== Leads with pending/accepted status ===");
  for (const l of pending) {
    console.log(`  ${l.name} | ${l.status} | ${l.providerId}`);
  }

  const relations = await listAllRelations(10) as Record<string, unknown>[];
  const targetIds = new Set(pending.map(l => l.providerId));

  console.log("\n=== Connections found on Unipile ===");
  let found = 0;
  for (const rel of relations) {
    const pid = (rel.provider_id || rel.member_id || rel.id || "") as string;
    if (targetIds.has(pid)) {
      const name = [rel.first_name, rel.last_name].filter(Boolean).join(" ") || rel.name;
      console.log(`  CONNECTED: ${name} (${pid})`);
      found++;
    }
  }
  if (found === 0) console.log("  None of the pending leads are connected yet");

  console.log("\n=== Recent chats (checking for replies) ===");
  const chatsRes = await listChats();
  const chats = chatsRes?.items || chatsRes?.data || chatsRes || [];
  if (Array.isArray(chats)) {
    for (const chat of chats.slice(0, 30) as Record<string, unknown>[]) {
      const attendees = (chat.attendees || chat.participants || []) as Record<string, unknown>[];
      for (const att of attendees) {
        const pid = (att.provider_id || att.member_id || att.id || "") as string;
        if (targetIds.has(pid)) {
          const name = att.name || att.first_name || "Unknown";
          const lastMsg = chat.last_message || chat.latest_message;
          console.log(`  Chat with ${name}:`);
          console.log(`    ${JSON.stringify(lastMsg, null, 2)}`);
        }
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
