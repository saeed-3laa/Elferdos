import Link from "next/link";
import { AccountShell } from "@/components/account-shell";
export default function PasswordHelp() {
  return <AccountShell title="استرجاع كلمة المرور"><section className="form-panel auth-panel"><p>تواصل مع إدارة مخزن الفردوس واطلب استرجاع حساب محلك. الإدارة هتتحقق من هويتك وبيانات المحل قبل تغيير كلمة المرور.</p><p>لا تشارك كلمة المرور القديمة مع أي شخص. استرجاع الحساب حاليًا عن طريق الإدارة، ولا توجد خدمة لإرسال رموز SMS.</p><Link className="text-link" href="/login">العودة لتسجيل الدخول</Link></section></AccountShell>;
}
