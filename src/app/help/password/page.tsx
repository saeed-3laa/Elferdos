import Link from "next/link";
import { AccountShell } from "@/components/account-shell";

export default async function PasswordHelp({searchParams}:{searchParams:Promise<{account?:string}>}) {
  const staff=(await searchParams).account==="staff";
  const configuredPhone=process.env.STORE_SUPPORT_PHONE?.trim()??"";
  const phone=/^\+?[0-9]{7,15}$/.test(configuredPhone)?configuredPhone:"";
  return <AccountShell title="استرجاع كلمة المرور">
    <section className="form-panel auth-panel">
      <p>{staff?"تواصل مع مالك حساب الإدارة للتحقق من هويتك واسترجاع حساب الموظف.":"تواصل مع إدارة مخزن الفردوس للتحقق من هويتك وبيانات المحل قبل استرجاع حسابك."}</p>
      {!staff && (phone ? <p><a className="text-link" href={`tel:${phone}`}>اتصل بالمخزن <bdi dir="ltr">{phone}</bdi></a></p> : <p>استخدم رقم المخزن الذي تتعامل معه أو تواصل مع الإدارة عند زيارة المخزن.</p>)}
      <p>لا تشارك كلمة المرور القديمة مع أي شخص.</p>
      <Link className="text-link" href={staff?"/staff/login":"/login"}>العودة لتسجيل الدخول</Link>
    </section>
  </AccountShell>;
}
