"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/domain/accounts";
import { MAX_IMAGE_BYTES, PRODUCT_IMAGE_BUCKET } from "@/domain/product-images";
import { requireStaff } from "@/server/auth/staff";
import {allowWorkload} from "@/server/auth/workload-limit";
import { createAdminClient } from "@/server/supabase/admin";
import { encodeProductImage } from "@/server/storage/encode-image";

const requestSchema = z.object({product_id:z.uuid(),revision:z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)});

async function removeUnused(path: string | null) {
  if (!path) return;
  try {
    const admin = createAdminClient();
    const {data,error} = await admin.from("product_images").select("product_id").eq("storage_path",path).limit(1);
    if (error || data.length) return; // An uncertain commit must never delete the active picture.
    const removed = await admin.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
    if (removed.error) console.error("PRODUCT_IMAGE_CLEANUP_PENDING");
  } catch { console.error("PRODUCT_IMAGE_CLEANUP_PENDING"); }
}

async function changeImage(form: FormData, remove: boolean): Promise<FormState> {
  const {client,user} = await requireStaff("catalog.write");
  if(!await allowWorkload("image",user.id))return {error:"طلبات صور كثيرة. حاول بعد ربع ساعة."};
  const parsed = requestSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return {error:"تعذّر تحديد المنتج والصورة. حدّث الصفحة."};
  const {product_id,revision} = parsed.data;
  const [product,image] = await Promise.all([
    client.from("products").select("id,archived_at").eq("id",product_id).maybeSingle(),
    client.from("product_images").select("storage_path,revision").eq("product_id",product_id).maybeSingle(),
  ]);
  if (product.error || image.error || !product.data || product.data.archived_at) return {error:"المنتج غير متاح للتعديل."};
  if ((image.data?.revision ?? 0)!==revision) return {error:"الصورة اتغيرت من مستخدم آخر. حدّث الصفحة قبل التعديل."};
  if (remove && form.get("confirmed")!=="on") return {error:"أكد حذف الصورة أولًا."};
  let path: string | null = null;
  let width: number | null = null;
  let height: number | null = null;
  try {
    const admin = createAdminClient();
    if (!remove) {
      const file = form.get("image");
      if (!(file instanceof File) || !file.size || file.size>MAX_IMAGE_BYTES) return {error:"اختار صورة JPEG أو PNG أو WebP، بحد أقصى ٥ ميجابايت."};
      const limit = await admin.rpc("consume_auth_limit",{p_bucket:createHash("sha256").update(`product-image:${user.id}`).digest("hex"),p_max:30,p_window_seconds:3600});
      if (limit.error || !limit.data) return {error:"تعذّر رفع المزيد من الصور الآن. حاول بعد قليل."};
      let encoded;
      try { encoded = await encodeProductImage(Buffer.from(await file.arrayBuffer())); }
      catch { return {error:"الصورة غير صالحة. استخدم JPEG أو PNG أو WebP ثابتة، بحد أقصى ٥ ميجابايت و٢٥ مليون بكسل."}; }
      path = `${product_id}/${randomUUID()}.webp`;
      width = encoded.width; height = encoded.height;
      const upload = await admin.storage.from(PRODUCT_IMAGE_BUCKET).upload(path,encoded.data,{contentType:"image/webp",cacheControl:"31536000",upsert:false});
      if (upload.error) { await removeUnused(path); return {error:"تعذّر رفع الصورة إلى التخزين. حاول مرة أخرى."}; }
    }
    const saved = await admin.rpc("commit_product_image",{p_actor:user.id,p_product:product_id,p_expected_revision:revision,p_path:path,p_width:width,p_height:height});
    if (saved.error) {
      await removeUnused(path);
      return {error:saved.error.code==="40001" ? "الصورة اتغيرت من مستخدم آخر. حدّث الصفحة قبل التعديل." : "تعذّر حفظ الصورة. راجع صلاحياتك وحالة المنتج."};
    }
    await removeUnused(image.data?.storage_path ?? null);
  } catch { await removeUnused(path); return {error:"تعذّر الاتصال لحفظ الصورة. حدّث الصفحة للتأكد من حالتها."}; }
  revalidatePath("/admin","layout"); revalidatePath("/");
  return {success:remove ? "تم حذف صورة المنتج" : "تم حفظ صورة المنتج"};
}

export async function uploadProductImage(_state: FormState,form: FormData) { return changeImage(form,false); }
export async function removeProductImage(_state: FormState,form: FormData) { return changeImage(form,true); }
