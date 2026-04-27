import { createHash } from "crypto";

export function hashTemplate(text: string): string {
  return createHash("sha256").update(text).digest("hex").substring(0, 8);
}
