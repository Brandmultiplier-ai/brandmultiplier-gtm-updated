import { NextResponse } from "next/server";
import { countAppUsers } from "@/lib/app-auth-persistence";

/** True when there are zero app users (first login must use bootstrap). */
export async function GET() {
  try {
    const n = await countAppUsers();
    return NextResponse.json({ needsBootstrap: n === 0 });
  } catch {
    return NextResponse.json({ needsBootstrap: true });
  }
}
