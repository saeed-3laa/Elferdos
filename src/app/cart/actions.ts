"use server";
import {z} from "zod";
import {createHash} from "node:crypto";
import {cartSchema,quoteSchema,orderError,type OrderQuote} from "@/domain/orders";
import {requireCustomer} from "@/server/auth/customer";
import {createAdminClient} from "@/server/supabase/admin";
import {revalidatePath} from "next/cache";

export async function useShopAddress(zone:unknown):Promise<{address?:{id:string;address:string;is_default:boolean;delivery_zones:{name:string}|null};error?:string}> {
 const {client,user}=await requireCustomer();const parsed=z.uuid().safeParse(zone);
 if(!parsed.success)return {error:"اختر منطقة توصيل عنوان محلك."};
 try {
  const saved=await client.rpc("save_shop_delivery_zone",{p_zone:parsed.data});
  if(saved.error)return {error:saved.error.message.includes("ZONE_UNAVAILABLE")?"المنطقة غير متاحة حاليًا. اختر منطقة توصيل متاحة.":"تعذّر ربط عنوان المحل. راجع بيانات حسابك والعناوين المحفوظة."};
  const result=await client.from("customer_addresses").select("id,address,is_default,delivery_zones(name)").eq("id",saved.data).eq("customer_id",user.id).single();
  if(result.error)return {error:"تعذّر تحميل عنوان المحل. حدّث الصفحة وحاول مرة أخرى."};
  revalidatePath("/cart");revalidatePath("/account");revalidatePath("/account/addresses");
  return {address:result.data as unknown as {id:string;address:string;is_default:boolean;delivery_zones:{name:string}|null}};
 }catch{return {error:"تعذّر حفظ منطقة عنوان المحل. حاول مرة أخرى."};}
}
export async function previewOrder(items:unknown,address:unknown):Promise<{quote?:OrderQuote;error?:string}> {
 const {client}=await requireCustomer();const parsed=cartSchema.min(1).safeParse(items);const id=z.uuid().safeParse(address);
 if(!parsed.success||!id.success)return {error:"راجع السلة واختار عنوان التوصيل."};
 try {const result=await client.rpc("quote_order",{p_items:parsed.data.map(({unit_id,quantity})=>({unit_id,quantity})),p_address:id.data});if(result.error)return {error:orderError(result.error.message)};return {quote:quoteSchema.parse(result.data)};}catch{return {error:"تعذّر حساب الطلب. حاول مرة أخرى."};}
}
export async function findSubmittedRequest(request:string) {
 const {client,user}=await requireCustomer();if(!z.uuid().safeParse(request).success)return null;
 const {data}=await client.from("orders").select("id").eq("customer_id",user.id).eq("request_id",request).maybeSingle();return data?.id as string|undefined ?? null;
}
export async function placeOrder(input:unknown):Promise<{id?:string;error?:string}> {
 const {client,user}=await requireCustomer();const parsed=z.object({request:z.uuid(),items:cartSchema.min(1),address:z.uuid(),method:z.enum(["cash","instapay"]),notes:z.string().max(1000),quote:quoteSchema}).safeParse(input);
 if(!parsed.success)return {error:"راجع بيانات الطلب."};
 try {const admin=createAdminClient();const limit=await admin.rpc("consume_auth_limit",{p_bucket:createHash("sha256").update(`order:${user.id}`).digest("hex"),p_max:30,p_window_seconds:3600});if(limit.error||!limit.data)return {error:"وصلت لحد محاولات إرسال الطلبات. حاول لاحقًا."};
 const d=parsed.data;const result=await client.rpc("submit_order",{p_request:d.request,p_items:d.items.map(({unit_id,quantity})=>({unit_id,quantity})),p_address:d.address,p_method:d.method,p_notes:d.notes,p_expected_quote:d.quote});
 if(result.error)return {error:orderError(result.error.message)};return {id:String(result.data)};
 }catch{return {error:"تعذّر تأكيد نتيجة الإرسال. أعد المحاولة بنفس الطلب؛ لن يُنشأ طلب مكرر."};}
}
