import { syncInbox } from "../src/lib/inbox-sync";

async function main() {
  const workspaceId = process.env.WORKSPACE_ID || "ws_default";
  const result = await syncInbox(workspaceId);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

