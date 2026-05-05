import Redis from "ioredis";

let client: Redis | null | undefined;

function redis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    client = null;
    return client;
  }
  client = new Redis(url, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  return client;
}

export async function getJsonCache<T>(key: string): Promise<T | null> {
  const r = redis();
  if (!r) return null;
  try {
    const raw = await r.get(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

export async function setJsonCache(key: string, value: unknown, ttlSeconds = 3600): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // Redis is an acceleration layer only; Supabase/local snapshots remain authoritative.
  }
}
