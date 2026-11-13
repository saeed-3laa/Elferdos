import Link from "next/link";
import { AuthForm } from "@/components/account-forms";
import { AccountShell } from "@/components/account-shell";
import { StatusPanel } from "@/components/status-panel";
import { getSupabaseConfig } from "@/server/config";

export default async function RegisterPage({searchParams}:{searchParams:Promise<{next?:string}>}) {
  const checkout=(await searchParams).next==="cart";
  return <AccountShell title="حساب جديد للمحل" intro="التوصيل داخل الإسكندرية. اكتب بيانات محلك وعنوانه عشان نقدر نخدمك.">
    <section className="form-panel auth-panel">
      {getSupabaseConfig() ? <AuthForm mode="register" checkout={checkout} /> : <StatusPanel title="إنشاء الحسابات قيد التجهيز"><p>الخدمة لم تبدأ بعد. حاول لاحقًا.</p></StatusPanel>}
      <p className="field-hint">استرجاع كلمة المرور عن طريق إدارة المخزن بعد التحقق من هويتك.</p>
      <div className="form-links"><Link href={checkout?"/login?next=cart":"/login"}>عندك حساب؟ تسجيل الدخول</Link></div>
    </section>
  </AccountShell>;
}
