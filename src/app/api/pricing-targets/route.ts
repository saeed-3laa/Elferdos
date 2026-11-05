import { z } from "zod";
import { createSessionClient } from "@/server/supabase/session";
import { getSupabaseConfig } from "@/server/config";
import { allowWorkload } from "@/server/auth/workload-limit";

const schema = z.object({ kind: z.enum(["product", "category", "unit"]), q: z.string().trim().min(1).max(100) });
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(request: Request) {
  const parsed = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ items: [] }, { status: 400, headers });
  if (!getSupabaseConfig()) return Response.json({ items: [] }, { status: 503, headers });
  const client = await createSessionClient(true);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return Response.json({ items: [] }, { status: 403, headers });
  if (!await allowWorkload("search", user.id)) return Response.json({ items: [] }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
  // The RPC independently checks catalog.write, the live session, email and MFA.
  const { data, error } = await client.rpc("search_pricing_targets", { p_kind: parsed.data.kind, p_query: parsed.data.q });
  if (error) return Response.json({ items: [] }, { status: error.code === "42501" ? 403 : 503, headers });
  return Response.json({ items: data }, { headers });
}
