"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addressSchema, profileSchema, type FormState } from "@/domain/accounts";
import { requireCustomer } from "@/server/auth/customer";

export async function updateProfileAction(_state: FormState, form: FormData): Promise<FormState> {
  const { client, user } = await requireCustomer();
  const parsed = profileSchema.safeParse(Object.fromEntries(
    ["full_name", "shop_name", "delivery_address", "area", "delivery_notes"].map((key) => [key, form.get(key) ?? ""]),
  ));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "راجع البيانات" };
  try {
    const { data, error } = await client.from("profiles").update(parsed.data).eq("id", user.id).select("id").single();
    if (error || !data) return { error: "تعذّر حفظ البيانات. حاول مرة أخرى." };
  } catch { return { error: "تعذّر الاتصال لحفظ البيانات." }; }
  revalidatePath("/account");
  revalidatePath("/account/addresses");
  revalidatePath("/cart");
  return { success: "تم حفظ بياناتك" };
}

export async function saveAddressAction(_state: FormState, form: FormData): Promise<FormState> {
  const { client } = await requireCustomer();
  const parsed = addressSchema.safeParse({
    id: form.get("id") ?? "", zone_id: form.get("zone_id"), address: form.get("address"),
    notes: form.get("notes") ?? "", is_default: form.get("is_default") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "راجع بيانات العنوان" };
  try {
    const { data, error } = await client.rpc("save_customer_address", {
      p_id: parsed.data.id || null, p_zone: parsed.data.zone_id, p_address: parsed.data.address,
      p_notes: parsed.data.notes, p_default: parsed.data.is_default,
    });
    if (error || !data) return { error: "تعذّر حفظ العنوان. تحقق من المنطقة، والحد الأقصى ٢٥ عنوانًا." };
  } catch { return { error: "تعذّر الاتصال لحفظ العنوان." }; }
  revalidatePath("/account/addresses");
  revalidatePath("/cart");
  return { success: "تم حفظ العنوان" };
}

export async function deleteAddressAction(_state: FormState, form: FormData): Promise<FormState> {
  const { client } = await requireCustomer();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "العنوان غير صالح" };
  try {
    const { error } = await client.rpc("delete_customer_address", { p_id: id.data });
    if (error) return { error: "تعذّر حذف العنوان. حدّث الصفحة وحاول مرة أخرى." };
  } catch { return { error: "تعذّر الاتصال لحذف العنوان." }; }
  revalidatePath("/account/addresses");
  revalidatePath("/cart");
  return { success: "تم حذف العنوان" };
}
