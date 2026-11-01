"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {requireCustomer} from "@/server/auth/customer";
import {requireStaff} from "@/server/auth/staff";
import type {FormState} from "@/domain/accounts";
const input=z.object({order:z.uuid(),request:z.uuid(),reason:z.string().trim().min(3).max(500),items:z.array(z.object({unit_id:z.uuid(),quantity:z.number().int().min(1).max(100000)})).min(1).max(100)});
function parse(form:FormData){let items:unknown;try{items=JSON.parse(String(form.get("items")??""));}catch{return null;}return input.safeParse({...Object.fromEntries(form),items});}
function message(error:string){const errors:Record<string,string>={RETURN_PENDING:"فيه طلب مرتجع تحت المراجعة بالفعل. راجعه قبل إنشاء مرتجع جديد.",INVALID_RETURN_QUANTITY:"راجع الكميات؛ لا يمكن إرجاع أكثر من الكمية المتبقية بالفاتورة.",RETURN_REQUIRES_DELIVERY:"المرتجعات متاحة بعد تسليم الطلب فقط.",RETURN_REJECTION_REASON:"اكتب سبب رفض المرتجع عشان يظهر للعميل.",EDIT_CONFLICT:"بيانات الطلب اتغيرت. حدّث الصفحة وراجع المرتجع.",RETURN_ALREADY_REVIEWED:"المرتجع اتراجع بالفعل. حدّث الصفحة."};return Object.entries(errors).find(([key])=>error.includes(key))?.[1]??"تعذّر تنفيذ المرتجع. راجع البيانات والصلاحيات وحاول مرة تانية.";}
function refresh(){revalidatePath("/admin/orders","layout");revalidatePath("/account/orders","layout");revalidatePath("/account/notifications");revalidatePath("/admin/returns");revalidatePath("/admin/products","layout");revalidatePath("/admin/reports");revalidatePath("/invoices","layout");revalidatePath("/");}
export async function requestReturn(_state:FormState,form:FormData):Promise<FormState>{
 const {client}=await requireCustomer();const parsed=parse(form);if(!parsed?.success)return {error:"اختار الأصناف والكميات واكتب سبب المرتجع."};
 const d=parsed.data;const result=await client.rpc("request_order_return",{p_order:d.order,p_request:d.request,p_items:d.items,p_reason:d.reason});if(result.error)return {error:message(result.error.message)};
 refresh();return {success:"تم إرسال طلب المرتجع للإدارة. الفاتورة يتحدثوا بعد الاعتماد."};
}
export async function createAdminReturn(_state:FormState,form:FormData):Promise<FormState>{
 const {client}=await requireStaff("orders.write");const parsed=parse(form);if(!parsed?.success||form.get("received")!=="on")return {error:"راجع الأصناف والكميات وأكد استلام المرتجع."};
 const d=parsed.data;const result=await client.rpc("create_admin_return",{p_order:d.order,p_request:d.request,p_items:d.items,p_reason:d.reason});if(result.error)return {error:message(result.error.message)};
 refresh();return {success:"تم اعتماد المرتجع وتحديث الفاتورة  راجع المبلغ المستحق رده."};
}
export async function reviewReturn(_state:FormState,form:FormData):Promise<FormState>{
 const {client}=await requireStaff("orders.write");const parsed=z.object({id:z.uuid(),decision:z.enum(["approve","reject"]),note:z.string().trim().max(500)}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:"راجع المرتجع والقرار."};const d=parsed.data;if(d.decision==="approve"&&form.get("received")!=="on")return {error:"أكد استلام البضاعة المرتجعة قبل اعتمادها."};
 const result=await client.rpc("review_order_return",{p_return:d.id,p_approve:d.decision==="approve",p_note:d.note});if(result.error)return {error:message(result.error.message)};
 refresh();return {success:d.decision==="approve"?"تم اعتماد المرتجع وتحديث الفاتورة":"تم رفض طلب المرتجع وإشعار العميل"};
}
