import { getSupabaseAdminClient } from "./supabase/admin";

export async function acquireJobLock(lockName: string, ownerToken: string, ttlSeconds = 1800): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc("acquire_job_lock", {
    lock_name: lockName,
    lock_ttl_seconds: ttlSeconds,
    owner_token: ownerToken,
  });

  if (error) {
    throw new Error(`acquireJobLock(${lockName}): ${error.message}`);
  }

  return Boolean(data);
}

export async function releaseJobLock(lockName: string, ownerToken: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc("release_job_lock", {
    lock_name: lockName,
    owner_token: ownerToken,
  });

  if (error) {
    throw new Error(`releaseJobLock(${lockName}): ${error.message}`);
  }

  return Boolean(data);
}
