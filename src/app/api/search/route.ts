import { NextRequest, NextResponse } from "next/server";
import { searchPosts, searchPeople, getPostsByAuthor } from "@/lib/unipile";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";

export async function POST(req: NextRequest) {
  const auth = await requireAppWorkspaceRead(req);
  if (!auth.ok) return auth.response;
  const { type, keywords, titleKeywords, authorId, datePeriod } = await req.json();

  let data;
  switch (type) {
    case "posts":
      data = await searchPosts(keywords, datePeriod);
      break;
    case "people":
      data = await searchPeople(keywords, titleKeywords);
      break;
    case "author_posts":
      data = await getPostsByAuthor(authorId);
      break;
    default:
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  return NextResponse.json(data);
}
