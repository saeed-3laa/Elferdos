import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "@/server/config";

export async function createSessionClient(writable = false) {
  const config = getSupabaseConfig();
  if (!config) throw new Error("SUPABASE_NOT_CONFIGURED");
  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(10000) }) },
    cookies: {
      getAll: () => cookieStore.getAll(),
      // Server Components are read-only; proxy refreshes their session first.
      setAll: (values) => {
        if (writable) values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });
}
