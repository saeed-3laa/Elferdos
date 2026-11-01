import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { createAdminClient } from "@/server/supabase/admin";

export async function allowAuthAttempt(action: "login" | "register", phone: string): Promise<boolean> {
  // Local development may derive the hash key from its server-only credential.
  const secret = process.env.AUTH_RATE_LIMIT_SECRET ||
    (process.env.NODE_ENV !== "production" ? process.env.SUPABASE_SERVICE_ROLE_KEY : undefined);
  if (!secret || secret.length < 32) throw new Error("AUTH_RATE_LIMIT_NOT_CONFIGURED");
  const client = createAdminClient();
  const consume = async (identifier: string, maximum: number, seconds: number) => {
    const hash = createHmac("sha256", secret).update(`${action}:${seconds}:${identifier}`).digest("hex");
    const { data, error } = await client.rpc("consume_auth_limit", { p_bucket: hash, p_max: maximum, p_window_seconds: seconds });
    if (error || typeof data !== "boolean") throw new Error("AUTH_RATE_LIMIT_UNAVAILABLE");
    return data;
  };
  if (!await consume(`phone:${phone}`, action === "login" ? 10 : 3, action === "login" ? 900 : 3600)) return false;
  // Only opt in when the deployment proxy overwrites this header. Do not trust
  // arbitrary browser-supplied X-Forwarded-For on an unconfigured deployment.
  const trustedHeader = process.env.TRUSTED_CLIENT_IP_HEADER;
  if (trustedHeader) {
    const ip = (await headers()).get(trustedHeader)?.split(",")[0]?.trim();
    if (!ip || !isIP(ip)) throw new Error("TRUSTED_CLIENT_IP_UNAVAILABLE");
    if (!await consume(`network:${ip}`, action === "login" ? 100 : 30, 900)) return false;
  }
  return true;
}
