import { NextResponse } from "next/server";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

export async function GET() {
  const seqDir = join(process.cwd(), "sequences");
  const sequences: { file: string; data: unknown }[] = [];

  try {
    const projects = readdirSync(seqDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const project of projects) {
      const projectDir = join(seqDir, project);
      const files = readdirSync(projectDir).filter((f) => f.endsWith(".json"));

      for (const file of files) {
        const content = readFileSync(join(projectDir, file), "utf-8");
        sequences.push({
          file: `${project}/${file}`,
          data: JSON.parse(content),
        });
      }
    }
  } catch {
    // sequences dir might not exist
  }

  return NextResponse.json({ sequences });
}
