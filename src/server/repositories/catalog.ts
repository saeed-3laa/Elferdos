import "server-only";
import { z } from "zod";
import { createPublicClient } from "@/server/supabase/public";

const itemSchema = z.object({
  unit_id: z.uuid(), product_id: z.uuid(), name: z.string(), sku: z.string(),
  category_name: z.string(), unit_name: z.string(), pieces_per_unit: z.number().int().positive(),
  minimum_quantity: z.number().int().positive(),
  price_piastres: z.number().int().nonnegative(), available: z.boolean(),
  image_path:z.string().nullable(),image_width:z.number().int().positive().nullable(),image_height:z.number().int().positive().nullable(),
  base_price_piastres:z.number().int().nonnegative(),price_label:z.string(),description:z.string(),
});
export type CatalogItem = z.infer<typeof itemSchema>;
export type CatalogResult =
  | { status: "ready"; items: CatalogItem[]; nextCursor: string | null }
  | { status: "not-configured" }
  | { status: "unavailable" };

export const catalogQuerySchema = z.object({
  q: z.string().trim().max(100).catch(""),
  after: z.uuid().optional().catch(undefined),
  category:z.union([z.literal(""),z.uuid()]).catch(""),sort:z.enum(["offers","sku","name"]).catch("offers"),available:z.string().optional().transform(value=>value==="1"),
});

export async function getCatalog(query: z.infer<typeof catalogQuerySchema>): Promise<CatalogResult> {
  const client = createPublicClient();
  if (!client) return { status: "not-configured" };
  try {
    const { data, error } = await client.rpc("browse_catalog", {
      p_query: query.q, p_after: query.after ?? null, p_limit: 25,p_category:query.category||null,p_sort:query.sort,p_available:query.available,
    });
    if (error) return { status: "unavailable" };
    const parsed = z.array(itemSchema).safeParse(data);
    if (!parsed.success) return { status: "unavailable" };
    const items = parsed.data.slice(0, 24);
    return { status: "ready", items, nextCursor: parsed.data.length > 24 ? items.at(-1)!.unit_id : null };
  } catch {
    return { status: "unavailable" };
  }
}
