import { join } from "path";

export function getDataDir(): string {
  return process.env.BM_GTM_DATA_DIR || join(process.cwd(), "data");
}

export function dataPath(...segments: string[]): string {
  return join(getDataDir(), ...segments);
}
