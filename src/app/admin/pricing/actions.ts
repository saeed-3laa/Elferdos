"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {requireStaff} from "@/server/auth/staff";
import {parseEgpInput} from "@/domain/admin";
import {egyptianPhoneSchema} from "@/domain/phone";
import type {FormState} from "@/domain/accounts";
import {offerFormSchema,nextOfferDay} from "@/domain/offers";

export async function archivePricingRule(_state: FormState, form: FormData): Promise<FormState> {
  const { client } = await requireStaff("catalog.write");
  const parsed = z.object({
    id: z.uuid(), revision: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().nonnegative()),
    archived: z.enum(["true", "false"]),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "راجع العرض وحاول مرة تانية." };

  const { id, revision, archived } = parsed.data;
  const { error } = await client.rpc("archive_pricing_rule", { p_id: id, p_revision: revision, p_archived: archived === "true" });
  if (error) return { error: error.code === "40001" ? "العرض اتغير. حدّث الصفحة وحاول تاني." : "تعذّر تحديث حالة العرض." };
  revalidatePath("/admin/pricing");
  revalidatePath("/");
  return { success: archived === "true" ? "تمت أرشفة العرض" : "تم استرجاع العرض وهو موقوف" };
}

export async function savePricingRule(_state:FormState,form:FormData):Promise<FormState>{
 const {client}=await requireStaff("catalog.write");const parsed=offerFormSchema.safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:"راجع بيانات العرض واختيار المنتج أو القسم وتواريخه. العروض غير مشروطة بكمية."};const d=parsed.data;let customer:string|null=null;
 try{if(d.customer_phone){const phone=egyptianPhoneSchema.parse(d.customer_phone);const profile=await client.from("profiles").select("id").eq("account_kind","CUSTOMER").eq("phone",phone).eq("active",true).single();if(profile.error)return {error:"رقم العميل غير موجود أو الحساب غير نشط."};customer=profile.data.id;}
 const [scope,target]=d.scope.split(":");if(scope!=="all"&&(!["unit","product","category"].includes(scope??"")||!z.uuid().safeParse(target).success))return {error:"اختار نطاق العرض."};
 const value=parseEgpInput(d.value);if(d.kind==="percent"&&(value<1||value>10000))return {error:"نسبة الخصم من ٠٫٠١ إلى ١٠٠ بالمئة."};
 const result=await client.rpc("save_pricing_rule",{p_id:d.id||null,p_revision:d.revision,p_name:d.name,p_unit:scope==="unit"?target:null,p_product:scope==="product"?target:null,p_category:scope==="category"?target:null,p_customer:customer,p_minimum:1,p_kind:d.kind,p_value:value,p_starts:`${d.starts} 00:00 Africa/Cairo`,p_ends:`${nextOfferDay(d.ends)} 00:00 Africa/Cairo`,p_active:form.get("active")==="on"});
 if(result.error)return {error:result.error.code==="40001"?"العرض اتغير. حدّث الصفحة قبل التعديل.":"تعذّر حفظ العرض. راجع البيانات."};
 }catch{return {error:"راجع قيمة السعر أو الخصم ورقم العميل."};}revalidatePath("/admin/pricing");revalidatePath("/");return {success:"تم حفظ العرض"};
}
export async function previewPricing(form:FormData):Promise<{price?:number;label?:string;error?:string}>{const {client}=await requireStaff("catalog.write");try{const unit=z.uuid().parse(form.get("unit"));const quantity=z.coerce.number().int().min(1).max(100000).parse(form.get("quantity"));let customer:string|null=null;const phone=String(form.get("phone")??"").trim();if(phone){const profile=await client.from("profiles").select("id").eq("account_kind","CUSTOMER").eq("phone",egyptianPhoneSchema.parse(phone)).single();if(profile.error)return {error:"العميل غير موجود"};customer=profile.data.id;}const result=await client.rpc("preview_price",{p_unit:unit,p_quantity:quantity,p_customer:customer});if(result.error||!result.data)return {error:"تعذّر حساب السعر"};return {price:Number(result.data.price),label:String(result.data.label)};}catch{return {error:"راجع الوحدة والكمية ورقم العميل"};}}
