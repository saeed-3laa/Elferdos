import { z } from "zod";
import { createSessionClient } from "@/server/supabase/session";
import { getSupabaseConfig } from "@/server/config";
import {allowWorkload} from "@/server/auth/workload-limit";

const schema = z.object({
  scope: z.enum(["catalog", "products", "pricing", "customers", "orders"]),
  q: z.string().trim().min(1).max(160),
  category: z.union([z.literal(""), z.uuid()]).optional(),
  state: z.enum(["all", "active", "inactive", "archived"]).optional(),
  available: z.enum(["0", "1"]).optional(),
  status: z.string().max(30).optional(),
  from: z.iso.date().optional(), to: z.iso.date().optional(),
});
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };
export async function GET(request: Request) {
  const parsed = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ items: [] }, { status: 400, headers });
  if (!getSupabaseConfig()) return Response.json({ items: [] }, { headers });
  const q = parsed.data;
  const client = await createSessionClient(true);
  const {data:{user}}=await client.auth.getUser();
  if(q.scope!=="catalog"&&!user)return Response.json({items:[]},{status:403,headers});
  if(!await allowWorkload("search",user?.id??"public"))return Response.json({items:[]},{status:429,headers:{...headers,"Retry-After":"60"}});
  const { data, error } = await client.rpc("search_suggestions", {
    p_scope: q.scope, p_query: q.q, p_category: q.category || null,
    p_state: q.state ?? "all", p_available: q.available === "1", p_status: q.status ?? "",
    p_from: q.from ?? null, p_to: q.to ?? null,
  });
  if (error) return Response.json({ items: [] }, { status: error.message.includes("FORBIDDEN") ? 403 : 503, headers });
  return Response.json({ items: data }, { headers });
}
