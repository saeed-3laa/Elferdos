"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {requireStaff} from "@/server/auth/staff";
import type {FormState} from "@/domain/accounts";
import {orderError,amendmentItemsSchema,amendmentQuoteSchema,type AmendmentQuote} from "@/domain/orders";
import {parseEgpInput} from "@/domain/admin";
export async function scheduleDelivery(_state:FormState,form:FormData):Promise<FormState>{
 const {client}=await requireStaff("orders.write");
 const parsed=z.object({order:z.uuid(),revision:z.coerce.number().int().nonnegative(),date:z.iso.date()}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:"اختار يوم التوصيل وحدّث الصفحة لو التاريخ اتغير."};
 try{const d=parsed.data;const result=await client.rpc("schedule_order_delivery",{p_order:d.order,p_revision:d.revision,p_date:d.date});if(result.error)return {error:result.error.message.includes("INVALID_DELIVERY_DATE")?"اختار النهارده أو بكرة أو بعد بكرة حسب توقيت الإسكندرية. حدّث الصفحة وحاول تاني.":orderError(result.error.message)};}
 catch{return {error:"تعذّر تأكيد حفظ الموعد. حدّث الصفحة وراجع الموعد قبل إعادة المحاولة."};}
 revalidatePath("/admin/orders","layout");revalidatePath("/account/orders","layout");revalidatePath("/account/notifications");
 return {success:"تم حفظ موعد التوصيل وإشعار العميل داخل حسابه"};
}
export async function transitionOrder(_state:FormState,form:FormData):Promise<FormState>{
 const {client}=await requireStaff("orders.write");const parsed=z.object({order:z.uuid(),revision:z.coerce.number().int().nonnegative(),status:z.enum(["READY","DELIVERED"]),note:z.string().max(200)}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:"راجع الحالة والملاحظة."};try{const d=parsed.data;
 if(d.status==="DELIVERED"){
  const payment=z.object({request:z.uuid(),method:z.enum(["cash","instapay"]),remaining:z.coerce.number().int().nonnegative().max(1000000000000),received:z.literal("on")}).safeParse(Object.fromEntries(form));
  if(!payment.success)return {error:"أكد استلام باقي مبلغ الطلب واختار طريقة التحصيل."};
  const result=await client.rpc("complete_order",{p_order:d.order,p_revision:d.revision,p_request:payment.data.request,p_method:payment.data.method,p_reference:d.note.trim()||"استلام باقي المبلغ وإتمام الطلب",p_expected_remaining:payment.data.remaining});
  if(result.error)return {error:orderError(result.error.message)};
 }else{const result=await client.rpc("transition_order",{p_order:d.order,p_revision:d.revision,p_status:d.status,p_note:d.note.trim()||"تم تجهيز الطلب"});if(result.error)return {error:orderError(result.error.message)};}
 }catch{return {error:"تعذّر الاتصال لتحديث الطلب."};}
 revalidatePath("/admin/orders","layout");revalidatePath("/account/orders","layout");revalidatePath("/");return {success:"تم تحديث حالة الطلب"};
}
const amendmentInput=z.object({order:z.uuid(),revision:z.number().int().nonnegative(),items:amendmentItemsSchema});
export async function previewAmendment(input:unknown):Promise<{quote?:AmendmentQuote;error?:string}>{
 const {client}=await requireStaff("orders.write");const parsed=amendmentInput.safeParse(input);if(!parsed.success)return {error:"راجع أصناف الطلب والكميات."};
 try{const d=parsed.data;const result=await client.rpc("preview_order_amendment",{p_order:d.order,p_revision:d.revision,p_items:d.items});if(result.error)return {error:orderError(result.error.message)};return {quote:amendmentQuoteSchema.parse(result.data)};}catch{return {error:"تعذّر حساب التعديل. حدّث الصفحة وحاول مرة أخرى."};}
}
export async function saveAmendment(input:unknown):Promise<{id?:string;error?:string}>{
 const {client}=await requireStaff("orders.write");const parsed=amendmentInput.extend({request:z.uuid(),reason:z.string().trim().min(3).max(500),expected:amendmentQuoteSchema}).safeParse(input);
 if(!parsed.success)return {error:"راجع التعديل واكتب سببًا يظهر للعميل."};
 try{const d=parsed.data;const result=await client.rpc("amend_order",{p_order:d.order,p_revision:d.revision,p_request:d.request,p_items:d.items,p_reason:d.reason,p_expected:d.expected});if(result.error)return {error:orderError(result.error.message)};
 revalidatePath("/admin/orders","layout");revalidatePath("/account/orders","layout");revalidatePath("/account/notifications");revalidatePath("/");return {id:result.data};
 }catch{return {error:"تعذّر تأكيد نتيجة الحفظ. أعد المحاولة؛ نفس التعديل لن يُطبق مرتين."};}
}
export async function recordPayment(_state:FormState,form:FormData):Promise<FormState>{
 const {client}=await requireStaff("orders.write");const parsed=z.object({order:z.uuid(),request:z.uuid(),amount:z.string(),method:z.enum(["cash","instapay"]),reference:z.string().trim().min(1).max(200),direction:z.enum(["receive","refund"])}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:"راجع المبلغ وطريقة الدفع والمرجع."};try{const d=parsed.data;const amount=parseEgpInput(d.amount)*(d.direction==="refund"?-1:1);const result=await client.rpc("record_payment",{p_order:d.order,p_request:d.request,p_amount:amount,p_method:d.method,p_reference:d.reference});if(result.error)return {error:orderError(result.error.message)};}catch{return {error:"تعذّر تسجيل التحصيل. راجع المبلغ."};}
 revalidatePath("/admin/orders","layout");revalidatePath("/account/orders","layout");return {success:"تم تسجيل حركة الدفع"};
}
