import Link from "next/link";
import { AuthForm } from "@/components/account-forms";
import { AccountShell } from "@/components/account-shell";
import { StatusPanel } from "@/components/status-panel";
import { getSupabaseConfig } from "@/server/config";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  return <AccountShell title="تسجيل الدخول" intro="ادخل برقم موبايلك وكلمة المرور للوصول لحساب المحل.">
    <section className="form-panel auth-panel">
      {notice === "credentials-updated" && <p className="form-success" role="status">تم تحديث بيانات الدخول. ادخل بالبيانات الجديدة.</p>}
      {notice === "inactive" && <p className="form-error" role="alert">الحساب غير متاح. تواصل مع إدارة المخزن.</p>}
      {getSupabaseConfig() ? <AuthForm mode="login" /> : <StatusPanel title="تسجيل الدخول قيد التجهيز"><p>الخدمة لم تبدأ بعد. حاول لاحقًا.</p></StatusPanel>}
      <div className="form-links"><Link href="/register">إنشاء حساب جديد</Link><Link href="/help/password">نسيت كلمة المرور؟</Link><Link href="/staff/login">دخول فريق الإدارة بالبريد</Link></div>
    </section>
  </AccountShell>;
}
