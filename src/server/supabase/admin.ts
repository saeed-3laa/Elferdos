import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/server/config";

export function createAdminClient() {
  const config = getSupabaseConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !key) throw new Error("SERVER_AUTH_NOT_CONFIGURED");
  return createClient(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(10000) }) },
  });
}
