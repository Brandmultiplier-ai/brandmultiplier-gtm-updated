export function normalizeLinkedInProfileUrlInput(input: string): { url: string; publicIdentifier: string } | null {
  const t = input.trim();
  if (!t) return null;
  const match = t.match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  if (match?.[1]) {
    let id = decodeURIComponent(match[1]).replace(/^\/+|\/+$/g, "");
    id = id.split("/")[0] || "";
    if (!id) return null;
    return { url: `https://www.linkedin.com/in/${id}`, publicIdentifier: id };
  }
  if (/^[a-zA-Z0-9_-]{3,100}$/.test(t)) {
    return { url: `https://www.linkedin.com/in/${t}`, publicIdentifier: t };
  }
  return null;
}
