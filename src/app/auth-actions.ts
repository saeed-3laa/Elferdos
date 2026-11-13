"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { loginSchema, profileSchema, registrationSchema, validationState, type FormState } from "@/domain/accounts";
import { allowAuthAttempt } from "@/server/auth/rate-limit";
import { createSessionClient } from "@/server/supabase/session";
import { z } from "zod";

const fields = ["full_name", "shop_name", "delivery_address", "area", "delivery_notes", "phone", "password", "confirm_password"];
function values(form: FormData) {
  return Object.fromEntries(fields.map((name) => [name, form.get(name) ?? ""]));
}

export async function loginAction(_state: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(values(form));
  if (!parsed.success) return validationState(parsed.error.issues, "راجع بيانات الدخول");
  let destination=form.get("next")==="cart"?"/cart":"/account";
  try {
    if (!await allowAuthAttempt("login", parsed.data.phone)) return { error: "محاولات كثيرة لهذا الرقم. حاول بعد ربع ساعة." };
    const client = await createSessionClient(true);
    const { data, error } = await client.auth.signInWithPassword(parsed.data);
    if (error || !data.user) return { error: "تعذّر تسجيل الدخول. راجع الرقم وكلمة المرور." };
    const { data: profile, error: profileError } = await client.from("profiles").select("id,account_kind").eq("id", data.user.id).eq("active", true).maybeSingle();
    if (profileError || !profile) {
      await client.auth.signOut({ scope: "local" });
      return { error: "الحساب غير متاح حاليًا. تواصل مع إدارة المخزن." };
    }
    if(profile.account_kind==="STAFF"){const staff=await client.rpc("get_staff_access");if(staff.error||!staff.data){await client.auth.signOut({scope:"local"});return {error:"صلاحية الموظف غير متاحة. تواصل مع المالك."};}if(staff.data.email_ready){await client.auth.signOut({scope:"local"});return {error:"حسابات الإدارة تدخل من صفحة دخول الإدارة بالبريد الإلكتروني."};}destination=staff.data.email_required?"/security/email":staff.data.mfa_required&&!staff.data.mfa_verified?"/security/mfa":"/admin";}
  } catch { return { error: "خدمة الدخول غير متاحة حاليًا. حاول بعد قليل." }; }
  redirect(destination);
}

export async function staffLoginAction(_state:FormState,form:FormData):Promise<FormState>{
 const parsed=z.object({email:z.string().trim().toLowerCase().max(254).pipe(z.email()),password:z.string().min(1).max(128)}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:"راجع البريد الإلكتروني وكلمة المرور."};
 let destination:string;
 try{
  if(!await allowAuthAttempt("login",parsed.data.email))return {error:"محاولات كثيرة. حاول بعد ربع ساعة."};
  const client=await createSessionClient(true);const signed=await client.auth.signInWithPassword(parsed.data);
  if(signed.error||!signed.data.user)return {error:"تعذّر الدخول. راجع البريد وكلمة المرور وتأكيد البريد."};
  const staff=await client.rpc("get_staff_access");
  if(staff.error||!staff.data||!staff.data.email_ready||!signed.data.user.email_confirmed_at){await client.auth.signOut({scope:"local"});return {error:"الحساب غير متاح كحساب إدارة ببريد موثّق. تواصل مع المالك."};}
  destination=staff.data.mfa_required&&!staff.data.mfa_verified?"/security/mfa":"/admin";
 }catch{return {error:"خدمة الدخول غير متاحة حاليًا."};}
 redirect(destination);
}

export async function registerAction(_state: FormState, form: FormData): Promise<FormState> {
  const parsed = registrationSchema.safeParse(values(form));
  if (!parsed.success) return validationState(parsed.error.issues, "راجع بيانات التسجيل");
  try {
    if (!await allowAuthAttempt("register", parsed.data.phone)) return { error: "محاولات تسجيل كثيرة لهذا الرقم. حاول بعد ساعة." };
    const client = await createSessionClient(true);
    const { phone, password } = parsed.data;
    const profile = profileSchema.parse(parsed.data);
    const { data, error } = await client.auth.signUp({ phone, password, options: { data: profile } });
    if (error || !data.user) return { error: "تعذّر إنشاء الحساب. راجع البيانات، أو جرّب تسجيل الدخول إن كان لك حساب بالفعل." };
    if (!data.session) return { error: "الحساب يحتاج مراجعة الإدارة لإكمال الدخول. لم نرسل رسالة تحقق. تواصل مع إدارة المخزن." };
    const { data: saved, error: profileError } = await client.from("profiles").select("id").eq("id", data.user.id).eq("active", true).maybeSingle();
    if (profileError || !saved) {
      await client.auth.signOut({ scope: "local" });
      return { error: "تعذّر تحميل بيانات الحساب. تواصل مع إدارة المخزن قبل إعادة المحاولة." };
    }
  } catch { return { error: "خدمة التسجيل غير متاحة حاليًا. حاول بعد قليل." }; }
  redirect(form.get("next")==="cart"?"/cart":"/account");
}

export async function logoutAction() {
  try {
    const client = await createSessionClient(true);
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) return redirect("/account?notice=logout-failed");
  } catch { redirect("/account?notice=logout-failed"); }
  revalidatePath("/", "layout");
  redirect("/login");
}
