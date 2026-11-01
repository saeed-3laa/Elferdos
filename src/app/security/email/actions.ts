"use server";
import {createClient} from "@supabase/supabase-js";
import {z} from "zod";
import {redirect} from "next/navigation";
import {requireAccount} from "@/server/auth/customer";
import {createAdminClient} from "@/server/supabase/admin";
import {createSessionClient} from "@/server/supabase/session";
import {getSupabaseConfig} from "@/server/config";
import {siteOrigin} from "@/server/auth/site-origin";
import {allowAuthAttempt} from "@/server/auth/rate-limit";
import type {FormState} from "@/domain/accounts";
import {requireCredentialAssurance} from "@/server/auth/credential-assurance";
export async function linkStaffEmail(_state:FormState,form:FormData):Promise<FormState>{
 const {user,profile,client:accountClient}=await requireAccount();if(profile.account_kind!=="STAFF")return {error:"الخدمة لفريق الإدارة فقط."};
 await requireCredentialAssurance(accountClient,profile.account_kind);
 const parsed=z.object({email:z.string().trim().toLowerCase().max(254).pipe(z.email()),password:z.string().min(1).max(128)}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:"راجع البريد وكلمة المرور الحالية."};
 try{
  if(!await allowAuthAttempt("login",`email-link:${user.id}`))return {error:"محاولات كثيرة. حاول لاحقًا."};
  const config=getSupabaseConfig();if(!config)return {error:"الخدمة غير متاحة."};
  const verify=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}});
  const identity=user.email&&user.email_confirmed_at?{email:user.email}:{phone:user.phone??""};
  const checked=await verify.auth.signInWithPassword({...identity,password:parsed.data.password});
  if(checked.error||checked.data.user?.id!==user.id)return {error:"كلمة المرور الحالية غير صحيحة."};
  if((await verify.auth.signOut({scope:"local"})).error)return {error:"تعذّر إكمال التحقق."};
  const client=await createSessionClient(true),admin=createAdminClient();
  const pending=await admin.rpc("request_staff_email",{p_actor:user.id,p_email:parsed.data.email});
  if(pending.error)return {error:"تعذّر تسجيل البريد. قد يكون مرتبطًا بحساب آخر."};
  const sent=await client.auth.updateUser({email:parsed.data.email},{emailRedirectTo:`${siteOrigin()}/auth/confirm`});
  if(sent.error)return {error:"تم حفظ البريد المطلوب، لكن تعذّر إرسال التحقق. يلزم إعداد خدمة البريد؛ دخولك الحالي مستمر لحين التأكيد."};
  return {success:"تم طلب التحقق. افتح رسالة البريد في نفس المتصفح وأكّد الملكية. البريد لا يصبح وسيلة دخول الإدارة قبل التأكيد."};
 }catch{return {error:"تعذّر إرسال التحقق. راجع إعدادات البريد وحاول لاحقًا."};}
}
export async function finishStaffEmail(){
 const {user,profile}=await requireAccount();if(profile.account_kind!=="STAFF")redirect("/account");
 const client=await createSessionClient(true);const access=await client.rpc("get_staff_access");
 await requireCredentialAssurance(client,profile.account_kind);
 if(access.error||!access.data?.email_ready)redirect("/security/email?notice=not-verified");
 const result=await createAdminClient().rpc("finish_staff_email_link",{p_actor:user.id});
 if(result.error)redirect("/security/email?notice=not-verified");
 await client.auth.signOut({scope:"local"});redirect("/staff/login?notice=email-confirmed");
}
