import fs from "fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "src", "app", "api");

function shouldSkipFile(rel) {
  const n = rel.split(path.sep).join("/");
  if (n.includes("cron/run/")) return true;
  if (n.endsWith("webhooks/route.ts")) return true;
  if (n.startsWith("workspaces/") && n.endsWith("route.ts")) return true;
  return false;
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) {
      if (name === "auth") continue;
      walk(p, out);
    } else if (name === "route.ts") {
      out.push(p);
    }
  }
  return out;
}

const all = walk(root);
for (const file of all) {
  const rel = path.relative(path.join(__dirname, "..", "src", "app", "api"), file);
  if (shouldSkipFile(rel)) continue;

  let s = fs.readFileSync(file, "utf8");
  if (!s.includes("getWorkspaceId") && !s.includes("from \"@/lib/workspace-context\"")) continue;

  s = s.replace(
    /import \{ getWorkspaceId \} from "@\/lib\/workspace-context";\n?/g,
    `import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";\n`,
  );
  s = s.replace(
    /(\s*)const workspaceId = getWorkspaceId\(req\);/g,
    (_m, indent) =>
      `${indent}const $wsa = await requireAppWorkspaceRead(req);\n` +
      `${indent}if (!$wsa.ok) return $wsa.response;\n` +
      `${indent}const workspaceId = $wsa.value.workspaceId;`,
  );
  fs.writeFileSync(file, s);
  console.log("patched", rel);
}
