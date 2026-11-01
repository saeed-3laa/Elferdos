"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {createHash} from "node:crypto";
import {requireStaff} from "@/server/auth/staff";
import {createAdminClient} from "@/server/supabase/admin";
import {egyptianPhoneSchema} from "@/domain/phone";
import type {FormState} from "@/domain/accounts";
export async function manageStaff(_state:FormState,form:FormData):Promise<FormState>{
 const {client}=await requireStaff("staff.manage");const parsed=z.object({target:z.uuid(),role:z.enum(["OWNER","MANAGER","ORDER_STAFF","VIEWER"])}).safeParse(Object.fromEntries(form));if(!parsed.success)return {error:"راجع الحساب والدور."};
 const result=await client.rpc("manage_staff",{p_target:parsed.data.target,p_role:parsed.data.role,p_active:form.get("active")==="on"});if(result.error)return {error:"تعذّر تعديل الصلاحية. لا يمكن تعديل حسابك بنفسك أو إزالة آخر مالك."};revalidatePath("/admin","layout");return {success:"تم تحديث صلاحيات الموظف"};
}
export async function manageCustomer(_state:FormState,form:FormData):Promise<FormState>{
 const {client}=await requireStaff("staff.manage");const target=z.uuid().safeParse(form.get("target"));if(!target.success)return {error:"حساب غير صحيح"};const result=await client.rpc("manage_customer",{p_target:target.data,p_active:form.get("active")==="true"});if(result.error)return {error:"تعذّر تغيير إتاحة الحساب. حساب المالك محمي."};revalidatePath("/admin/customers","layout");return {success:"تم تحديث إتاحة الحساب"};
}
export async function recoverAccount(_state:FormState,form:FormData):Promise<FormState>{
 const {user}=await requireStaff("staff.manage");const parsed=z.object({target:z.uuid(),reason:z.string().trim().min(5).max(500),password:z.string().max(128),phone:z.string().trim(),verified:z.literal("on")}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:"أكد التحقق من هوية صاحب الحساب، واكتب السبب وكلمة مرور جديدة من ١٢ حرفًا على الأقل."};
 const d=parsed.data;if((d.password&&d.password.length<12)||(!d.password&&!d.phone))return {error:"اكتب كلمة مرور من ١٢ حرفًا على الأقل أو رقم موبايل جديد."};if(d.target===user.id)return {error:"استخدم إجراء منفصل لتغيير بيانات حساب المالك."};
 try{const admin=createAdminClient();const target=await admin.from("profiles").select("id,phone,active,account_kind").eq("id",d.target).single();const staff=await admin.from("staff_assignments").select("role,active").eq("user_id",d.target).maybeSingle();if(target.error||staff.error||!target.data)return {error:"الحساب غير متاح."};
 const limit=await admin.rpc("consume_auth_limit",{p_bucket:createHash("sha256").update(`recovery:${user.id}`).digest("hex"),p_max:10,p_window_seconds:3600});if(limit.error||!limit.data)return {error:"تعذّر تنفيذ المزيد من محاولات الاسترجاع الآن."};
 const phone=d.phone?egyptianPhoneSchema.parse(d.phone):null;if(phone&&phone!==target.data.phone){const duplicate=await admin.from("profiles").select("id").eq("phone",phone).maybeSingle();if(duplicate.error||duplicate.data)return {error:"الرقم الجديد مستخدم بالفعل."};}
 const audit=await admin.from("audit_logs").insert({actor_id:user.id,entity:"account_recovery",operation:"INSERT",after_data:{user_id:d.target,reason:d.reason,phase:"started",phone_changed:phone!==null}});if(audit.error)return {error:"تعذّر تسجيل إجراء الاسترجاع، ولم يتم تغيير بيانات الدخول."};
 const updated=await admin.auth.admin.updateUserById(d.target,{...(d.password?{password:d.password}:{}),ban_duration:"none",...(phone&&target.data.account_kind!=="STAFF"?{phone,phone_confirm:true}:{})});if(updated.error)return {error:"تعذّر تحديث بيانات الدخول. راجع الرقم وكلمة المرور."};
 const finished=await admin.rpc("complete_account_recovery",{p_actor:user.id,p_target:d.target,p_reason:d.reason,p_new_phone:phone});if(finished.error)return {error:"اتغيرت بيانات الدخول لكن تعذّر إكمال إبطال الجلسات أو مزامنة الرقم. أعد نفس الإجراء فورًا لإكماله."};
 }catch{return {error:"تعذّر إكمال الاسترجاع. راجع حالة الحساب ثم أعد المحاولة بنفس البيانات."};}revalidatePath("/admin/staff");revalidatePath("/admin/customers","layout");return {success:"تم تحديث بيانات الدخول وإبطال جلسات الحساب السابقة. سلّم كلمة المرور لصاحب الحساب عبر وسيلة تحقق منها بنفسك."};
}
export async function savePermissions(_state:FormState,form:FormData):Promise<FormState>{const {client}=await requireStaff("staff.manage");const role=z.enum(["MANAGER","ORDER_STAFF","VIEWER"]).safeParse(form.get("role"));if(!role.success)return {error:"اختار الدور."};const result=await client.rpc("save_role_permissions",{p_role:role.data,p_permissions:form.getAll("permission")});if(result.error)return {error:"راجع الصلاحيات؛ الكتابة تحتاج صلاحية القراءة المقابلة."};revalidatePath("/admin","layout");return {success:"تم تحديث صلاحيات الدور"};}

export async function saveManagedProfile(_state:FormState,form:FormData):Promise<FormState>{
 const {client}=await requireStaff("staff.manage");const target=z.uuid().safeParse(form.get("target"));if(!target.success)return {error:"حساب غير صحيح."};
 const profile=await client.from("profiles").select("account_kind").eq("id",target.data).single();if(profile.error)return {error:"الحساب غير متاح."};
 const schema=profile.data.account_kind==="STAFF"?z.object({full_name:z.string().trim().min(3).max(160)}):z.object({full_name:z.string().trim().min(3).max(160),shop_name:z.string().trim().min(2).max(160),delivery_address:z.string().trim().min(10).max(1000),area:z.string().trim().min(2).max(100),delivery_notes:z.string().trim().max(1000)});
 const parsed=schema.safeParse(Object.fromEntries(form));if(!parsed.success)return {error:"راجع الاسم وبيانات الحساب المطلوبة."};
 const saved=await client.rpc("save_managed_profile",{p_target:target.data,p_fields:parsed.data});if(saved.error)return {error:"تعذّر حفظ بيانات الحساب."};
 revalidatePath("/admin","layout");revalidatePath("/account");return {success:"تم حفظ بيانات الحساب"};
}
