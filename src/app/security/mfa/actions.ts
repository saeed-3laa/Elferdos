"use server";
import {z} from "zod";
import {redirect} from "next/navigation";
import {createHash} from "node:crypto";
import {requireAccount} from "@/server/auth/customer";
import {createSessionClient} from "@/server/supabase/session";
import {createAdminClient} from "@/server/supabase/admin";
export type MfaState={error?:string;factor?:string;qr?:string};
async function mfaSession(){const account=await requireAccount();if(account.profile.account_kind!=="STAFF")redirect("/account");const client=await createSessionClient(true);const access=await client.rpc("get_staff_access");if(access.error||!access.data)redirect("/login?notice=inactive");return {...account,client};}
export async function enrollMfa():Promise<MfaState>{
 const {client,user}=await mfaSession();
 if(!user.email||!user.email_confirmed_at)return {error:"تفعيل تطبيق التحقق يحتاج بريدًا حقيقيًا موثّقًا في حساب الإدارة على خدمة الحسابات. حساب الموبايل فقط لا يدعم ربط TOTP في النسخة الحالية من المزود."};
 try{const limit=await createAdminClient().rpc("consume_auth_limit",{p_bucket:createHash('sha256').update(`mfa-enroll:${user.id}`).digest('hex'),p_max:5,p_window_seconds:3600});if(limit.error||!limit.data)return {error:"محاولات تجهيز كثيرة. حاول لاحقًا."};
 const factors=await client.auth.mfa.listFactors();if(factors.error)return {error:"تعذّر تحميل وسائل التحقق."};if(factors.data.totp.some(factor=>factor.status==="verified"))return {error:"عندك تطبيق تحقق مفعّل بالفعل. حدّث الصفحة واكتب الرمز."};
 const enrolled=await client.auth.mfa.enroll({factorType:"totp",friendlyName:`الفردوس ${crypto.randomUUID().slice(0,8)}`,issuer:"Al-Ferdous"});if(enrolled.error)return {error:"تعذّر تجهيز التحقق بخطوتين. راجع دعم TOTP في إعدادات Auth."};
 return {factor:enrolled.data.id,qr:enrolled.data.totp.qr_code};
 }catch{return {error:"خدمة التحقق غير متاحة. حاول لاحقًا."};}
}
export async function verifyMfa(_state:MfaState,form:FormData):Promise<MfaState>{
 const {client,user}=await mfaSession();const parsed=z.object({factor:z.uuid(),code:z.string().trim().regex(/^\d{6}$/)}).safeParse(Object.fromEntries(form));if(!parsed.success)return {error:"اكتب رمز التحقق المكوّن من ٦ أرقام."};
 try{const limit=await createAdminClient().rpc("consume_auth_limit",{p_bucket:createHash('sha256').update(`mfa-verify:${user.id}`).digest('hex'),p_max:10,p_window_seconds:900});if(limit.error||!limit.data)return {error:"محاولات كثيرة. حاول بعد ربع ساعة."};
 const result=await client.auth.mfa.challengeAndVerify({factorId:parsed.data.factor,code:parsed.data.code});if(result.error)return {error:"الرمز غير صحيح أو انتهى وقته. جرّب الرمز الحالي في التطبيق."};
 }catch{return {error:"تعذّر تأكيد الرمز. حاول لاحقًا."};}
 redirect("/admin");
}
