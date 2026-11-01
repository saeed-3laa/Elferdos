"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { productSchema, referenceSchema, unitSchema } from "@/domain/admin";
import type { FormState } from "@/domain/accounts";
import { requireStaff } from "@/server/auth/staff";

function fields(form: FormData) { return Object.fromEntries(form.entries()); }
function errorMessage(error: { code?: string; message?: string } | null) {
  if (error?.code === "40001") return "البيانات اتغيرت من مستخدم آخر. حدّث الصفحة وراجع التغيير قبل الحفظ.";
  if (error?.code === "23505") return "الاسم أو الكود مستخدم بالفعل. اختار قيمة مختلفة.";
  if (error?.message?.includes("PRODUCT_ARCHIVED")) return "المنتج مؤرشف. ألغِ الأرشفة قبل تعديله.";
  return "تعذّر حفظ التغيير. راجع البيانات والصلاحيات وحاول مرة أخرى.";
}
function invalidate() { revalidatePath("/admin", "layout"); revalidatePath("/"); revalidatePath("/account/addresses"); }
export async function savePaymentSettings(_state:FormState,form:FormData):Promise<FormState>{const {client}=await requireStaff("settings.write");const parsed=z.object({revision:z.coerce.number().int().nonnegative(),recipient:z.string().trim().max(300)}).safeParse(fields(form));if(!parsed.success)return {error:"راجع بيانات إنستا باي."};const result=await client.rpc("save_payment_settings",{p_revision:parsed.data.revision,p_recipient:parsed.data.recipient});if(result.error)return {error:errorMessage(result.error)};invalidate();revalidatePath("/cart");return {success:"تم حفظ بيانات إنستا باي"};}

export async function saveReference(_state: FormState, form: FormData): Promise<FormState> {
  const kind = form.get("kind");
  const { client } = await requireStaff(kind === "zone" ? "settings.write" : "catalog.write");
  const parsed = referenceSchema.safeParse({ ...fields(form), active: form.get("active") === "on" });
  if (!parsed.success) return { error: "راجع الاسم وحالة التفعيل." };
  try {
    const d = parsed.data;
    const { error } = await client.rpc("save_admin_reference", { p_kind: d.kind, p_id: d.id || null, p_expected_revision: d.revision, p_name: d.name, p_active: d.active, p_fee: 0 });
    if (error) return { error: errorMessage(error) };
  } catch { return { error: "تعذّر الاتصال لحفظ البيانات." }; }
  invalidate();
  return { success: "تم الحفظ" };
}

export async function saveProduct(_state: FormState, form: FormData): Promise<FormState> {
  const { client } = await requireStaff("catalog.write");
  const parsed = productSchema.safeParse({ ...fields(form), active: form.get("active") === "on" });
  if (!["true","false"].includes(String(form.get("available")))) return {error:"حدد التوافر."};
  if (!parsed.success) return { error: "راجع اسم المنتج والكود والقسم والوصف." };
  let id: string;
  try {
    const d = parsed.data;
    const result = await client.rpc("save_product_with_availability", { p_id: d.id || null, p_expected_revision: d.revision, p_sku: d.sku, p_name: d.name, p_category: d.category_id, p_description: d.description, p_active: d.active, p_available: form.get("available")==="true" });
    if (result.error || typeof result.data !== "string") return { error: errorMessage(result.error) };
    id = result.data;
  } catch { return { error: "تعذّر الاتصال لحفظ المنتج." }; }
  invalidate();
  if (!parsed.data.id) redirect(`/admin/products/${id}`);
  return { success: "تم حفظ المنتج" };
}

export async function archiveProduct(_state: FormState, form: FormData): Promise<FormState> {
  const { client } = await requireStaff("catalog.write");
  const id = z.uuid().safeParse(form.get("id"));
  const revision = z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).safeParse(form.get("revision"));
  if (!id.success || !revision.success || form.get("confirmed") !== "on") return { error: "أكد العملية أولًا" };
  try {
    const { error } = await client.rpc("archive_admin_product", { p_id: id.data, p_expected_revision: revision.data, p_archived: form.get("archived") === "true" });
    if (error) return { error: errorMessage(error) };
  } catch { return { error: "تعذّر الاتصال لتغيير الأرشفة." }; }
  invalidate();
  return { success: "تم تحديث حالة الأرشفة. المنتج غير نشط لحين تفعيله." };
}

export async function saveUnit(_state: FormState, form: FormData): Promise<FormState> {
  const { client } = await requireStaff("catalog.write");
  const parsed = unitSchema.safeParse({ ...fields(form), active: form.get("active") === "on" });
  if (!parsed.success) return { error: "راجع وحدة الجملة ومحتواها والسعر والحد الأدنى." };
  try {
    const d = parsed.data;
    const { error } = await client.rpc("save_admin_unit", { p_id: d.id || null, p_product: d.product_id, p_expected_revision: d.revision, p_name: d.name, p_pieces: d.pieces, p_price: d.price, p_minimum: d.minimum, p_active: d.active });
    if (error) return { error: errorMessage(error) };
  } catch { return { error: "تعذّر الاتصال لحفظ الوحدة." }; }
  invalidate();
  return { success: "تم حفظ وحدة الجملة" };
}

