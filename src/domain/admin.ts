import { z } from "zod";

export function parseEgpInput(raw: string): number {
  const value = raw.trim().replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace("٫", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(value) || value.length > 16) throw new Error("اكتب مبلغًا صحيحًا بدون فواصل آلاف وبحد أقصى قرشين عشريين");
  const [whole, fraction = ""] = value.split(".");
  const amount = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (amount > 100000000n) throw new Error("المبلغ أكبر من الحد المسموح");
  return Number(amount);
}
export function egpInput(value: number): string { return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`; }
const amount = z.string().transform((value, ctx) => {
  try { return parseEgpInput(value); } catch { ctx.addIssue({ code: "custom", message: "اكتب مبلغًا بالجنيه بدون فواصل آلاف وبحد أقصى منزلتين عشريتين" }); return z.NEVER; }
});
const integer = (min: number, max: number) => z.string().trim().regex(/^\d+$/, "اكتب عددًا صحيحًا").transform(Number).pipe(z.number().int().min(min).max(max));
const identity = { id: z.union([z.literal(""), z.uuid()]), revision: integer(0, Number.MAX_SAFE_INTEGER) };
export const referenceSchema = z.object({ ...identity, kind: z.enum(["category", "zone"]), name: z.string().trim().min(1).max(100), active: z.boolean() });
export const productSchema = z.object({ ...identity, sku: z.string().trim().toUpperCase().regex(/^(?:[A-Z0-9][A-Z0-9_-]{0,63})?$/, "الكود حروف إنجليزية وأرقام وشرطة فقط").default(""), name: z.string().trim().min(1).max(200), category_id: z.uuid(), description: z.string().trim().max(4000), active: z.boolean() });
export const unitSchema = z.object({ ...identity, product_id: z.uuid(), name: z.string().trim().min(1).max(80).refine((name) => !["قطعة", "كيس", "كانز", "زجاجة"].includes(name), "اختر وحدة جملة كاملة"), pieces: integer(2, 1000000), price: amount, minimum: integer(1, 100000), active: z.boolean() });
export const staffAccessSchema = z.object({ role: z.enum(["OWNER", "MANAGER", "ORDER_STAFF", "VIEWER"]), permissions: z.array(z.string()),email_required:z.boolean().default(false),email_ready:z.boolean().default(false),mfa_required:z.boolean().default(false),mfa_verified:z.boolean().default(false) });
export type StaffAccess = z.infer<typeof staffAccessSchema>;
export type AdminReference = { id: string; name: string; active: boolean; revision: number; };
export type AdminProduct = { id: string; sku: string; name: string; category_id: string; description: string; active: boolean; available: boolean; archived_at: string | null; revision: number };
export type AdminUnit = { id: string; product_id: string; name: string; pieces_per_unit: number; price_piastres: number; minimum_quantity: number; active: boolean; revision: number };
