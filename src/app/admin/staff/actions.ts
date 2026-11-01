"use server";
import {z} from "zod";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {createHash} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {requireStaff} from "@/server/auth/staff";
import {requireAccount} from "@/server/auth/customer";
import {createAdminClient} from "@/server/supabase/admin";
import {createSessionClient} from "@/server/supabase/session";
import {getSupabaseConfig} from "@/server/config";
import {egyptianPhoneSchema} from "@/domain/phone";
import type {FormState} from "@/domain/accounts";
import {siteOrigin} from "@/server/auth/site-origin";
import {requireCredentialAssurance} from "@/server/auth/credential-assurance";

export async function createStaff(_state:FormState,form:FormData):Promise<FormState>{
 const {user}=await requireStaff("staff.manage");
 const parsed=z.object({email:z.string().trim().toLowerCase().max(254).pipe(z.email()),phone:z.union([z.literal(""),egyptianPhoneSchema]).default(""),password:z.string().min(12).max(128),full_name:z.string().trim().max(160),role:z.enum(["VIEWER","ORDER_STAFF","MANAGER","OWNER"])}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:"راجع البريد والدور وكلمة المرور (١٢ حرفًا على الأقل)."};
 const d=parsed.data;const name=d.full_name||"موظف إدارة";if(name.length<3)return {error:"اسم الموظف لا يقل عن ٣ حروف."};
 try{
  const admin=createAdminClient();const limited=await admin.rpc("consume_auth_limit",{p_bucket:createHash("sha256").update(`staff-create:${user.id}`).digest("hex"),p_max:20,p_window_seconds:3600});if(limited.error||!limited.data)return {error:"تعذّر إنشاء المزيد من الحسابات الآن. حاول لاحقًا."};
  const existing=await admin.from("profiles").select("id").eq("login_email",d.email).maybeSingle();if(existing.error||existing.data)return {error:"البريد غير متاح لحساب جديد."};
  const created=await admin.auth.admin.createUser({email:d.email,password:d.password,email_confirm:false,ban_duration:"8760h",user_metadata:{full_name:name}});if(created.error||!created.data.user)return {error:"تعذّر إنشاء الحساب. راجع البريد أو استخدم بريدًا آخر."};
  const id=created.data.user.id;
  const provision=await admin.rpc("provision_email_staff",{p_actor:user.id,p_target:id,p_name:name,p_role:d.role,p_phone:d.phone||null});
  if(provision.error){
   const state=await admin.from("profiles").select("account_kind").eq("id",id).maybeSingle();
   if(!state.error&&!state.data)await admin.auth.admin.deleteUser(id);
   return {error:"تعذّر إكمال إنشاء الموظف. الحساب لا يقبل الدخول؛ راجع فريق الإدارة قبل إعادة المحاولة."};
  }
  const enabled=await admin.auth.admin.updateUserById(id,{ban_duration:"none"});if(enabled.error)return {error:"اتحفظ الموظف لكن تعذّر تفعيل الدخول. افتح حسابه من فريق الإدارة وأعد ضبط بيانات الدخول."};
  const session=await createSessionClient(true);const confirmation=await session.auth.resend({type:"signup",email:d.email,options:{emailRedirectTo:`${siteOrigin()}/auth/confirm`}});
  if(confirmation.error){revalidatePath("/admin/staff");return {success:"تم إنشاء حساب الموظف، لكن تعذّر إرسال تأكيد البريد. الحساب لا يدخل قبل التحقق؛ أعد إرسال التأكيد من صفحة الموظف بعد ضبط خدمة البريد."};}
 }catch{return {error:"تعذّر تأكيد إنشاء الموظف. راجع قائمة الفريق قبل إعادة المحاولة."};}
 revalidatePath("/admin/staff");return {success:"تم إنشاء حساب الموظف وطلب إرسال تأكيد البريد. يدخل من صفحة الإدارة بعد تأكيد البريد."};
}

export async function changeOwnCredentials(_state:FormState,form:FormData):Promise<FormState>{
 const {user,profile,client:accountClient}=await requireAccount();
 await requireCredentialAssurance(accountClient,profile.account_kind);
 const parsed=z.object({current_password:z.string().min(1).max(128),password:z.string().max(128),confirm_password:z.string().max(128),phone:z.string().trim().max(30)}).safeParse({current_password:form.get("current_password"),password:form.get("password")??"",confirm_password:form.get("confirm_password")??"",phone:form.get("phone")??""});
 if(!parsed.success)return {error:"اكتب كلمة المرور الحالية وراجع البيانات."};const d=parsed.data;
 if(!d.password&&!d.phone)return {error:"اكتب كلمة مرور جديدة أو رقم موبايل جديد."};
 if(d.password&&(d.password.length<12||d.password!==d.confirm_password||d.password===d.current_password))return {error:"كلمة المرور الجديدة مختلفة عن الحالية، ومن ١٢ حرفًا على الأقل، والتأكيد مطابق."};
 const session=await createSessionClient(true);const access=await session.rpc("get_staff_access");
 if(d.phone&&access.data?.role!=="OWNER")return {error:"تغيير رقم الموبايل يتم بواسطة المالك."};
 const phone=d.phone?egyptianPhoneSchema.safeParse(d.phone):null;if(phone&&!phone.success)return {error:"رقم الموبايل غير صحيح."};
 try{
  const admin=createAdminClient(),config=getSupabaseConfig();if(!config)return {error:"خدمة الحساب غير متاحة."};
  const limit=await admin.rpc("consume_auth_limit",{p_bucket:createHash("sha256").update(`own-credentials:${user.id}`).digest("hex"),p_max:6,p_window_seconds:3600});if(limit.error||!limit.data)return {error:"محاولات كثيرة. حاول لاحقًا."};
  const verify=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,cache:"no-store",signal:AbortSignal.timeout(10000)})}});
  const identity=profile.account_kind==="STAFF"&&user.email&&user.email_confirmed_at?{email:user.email}:{phone:user.phone??""};
  const checked=await verify.auth.signInWithPassword({...identity,password:d.current_password});
  if(checked.error||checked.data.user?.id!==user.id)return {error:"كلمة المرور الحالية غير صحيحة."};
  const signedOut=await verify.auth.signOut({scope:"local"});if(signedOut.error)return {error:"تعذّر إكمال التحقق. حاول لاحقًا."};
  const newPhone=phone?.success?phone.data:null;
  if(d.password||newPhone&&profile.account_kind!=="STAFF"){const updated=await admin.auth.admin.updateUserById(user.id,{...(d.password?{password:d.password}:{}),...(newPhone&&profile.account_kind!=="STAFF"?{phone:newPhone,phone_confirm:true}:{})});if(updated.error)return {error:"تعذّر تحديث البيانات. الرقم قد يكون مستخدمًا بالفعل."};}
  const finish=await admin.rpc("finish_own_credentials",{p_actor:user.id,p_phone:newPhone});if(finish.error)return {error:"اتغيرت بيانات الدخول لكن تعذّر إكمال مزامنة الحساب. تواصل مع المالك لإكمال المزامنة."};
  await session.auth.signOut({scope:"local"});
 }catch{return {error:"تعذّر تأكيد تحديث البيانات. جرّب تسجيل الدخول بالبيانات الجديدة أو تواصل مع المالك."};}
 redirect(profile.account_kind==="STAFF"&&user.email_confirmed_at?"/staff/login?notice=credentials-updated":"/login?notice=credentials-updated");
}

export async function resendStaffConfirmation(_state:FormState,form:FormData):Promise<FormState>{
 const {client}=await requireStaff("staff.manage");const id=z.uuid().safeParse(form.get("target"));if(!id.success)return {error:"حساب غير صحيح."};
 const profile=await client.from("profiles").select("login_email").eq("id",id.data).eq("account_kind","STAFF").single();if(profile.error||!profile.data.login_email)return {error:"لا يوجد بريد مسجل لهذا الموظف."};
 try{const admin=createAdminClient();const limit=await admin.rpc("consume_auth_limit",{p_bucket:createHash("sha256").update(`staff-confirm:${id.data}`).digest("hex"),p_max:3,p_window_seconds:3600});if(limit.error||!limit.data)return {error:"محاولات كثيرة. حاول بعد ساعة."};const sent=await client.auth.resend({type:"signup",email:profile.data.login_email,options:{emailRedirectTo:`${siteOrigin()}/auth/confirm`}});if(sent.error)return {error:"تعذّر إرسال التأكيد. راجع إعدادات خدمة البريد."};return {success:"تم طلب إرسال رابط التأكيد للبريد المسجل إن كان غير مؤكد."};}catch{return {error:"خدمة البريد غير متاحة."};}
}
