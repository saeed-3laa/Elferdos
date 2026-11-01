import Link from "next/link";
import { AccountShell } from "@/components/account-shell";
import { ProfileForm } from "@/components/account-forms";
import { requireAccount } from "@/server/auth/customer";
import { logoutAction } from "@/app/auth-actions";
import { getSupabaseConfig } from "@/server/config";
import { redirect } from "next/navigation";
import { staffAccessSchema } from "@/domain/admin";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  if (!getSupabaseConfig()) redirect("/login");
  const { profile, client } = await requireAccount();
  if(profile.account_kind==="STAFF")redirect("/admin/profile");
  const staff = staffAccessSchema.safeParse((await client.rpc("get_staff_access")).data);
  const { notice } = await searchParams;
  return <AccountShell title="بيانات حسابي" intro="راجع بيانات محلك وعنوان التوصيل الأساسي.">
    <div className="account-columns"><section className="form-panel">
      {notice === "logout-failed" && <p className="form-error" role="alert">تعذّر تسجيل الخروج. حاول مرة أخرى.</p>}
      {notice === "staff-only" && <p className="form-error" role="alert">هذه الصفحة مخصصة لموظفي المخزن المصرح لهم.</p>}
      <p className="account-phone">رقم الموبايل: <bdi>{profile.phone}</bdi></p>
      <p className="field-hint">لتغيير رقم الموبايل، تواصل مع إدارة المخزن.</p>
      <ProfileForm profile={profile} />
    </section><aside className="form-panel account-aside">{staff.success && <><h2>إدارة المخزن</h2><Link className="button" href="/admin">لوحة الإدارة</Link><hr /></>}<h2>إشعارات الطلبات</h2><p>راجع تعديلات المخزن على طلباتك والإجماليات الجديدة.</p><Link className="text-link" href="/account/notifications">عرض الإشعارات</Link><hr /><h2>كلمة المرور</h2><Link className="text-link" href="/account/security">تغيير كلمة المرور</Link><hr /><h2>عناوين التوصيل</h2><p>احفظ عناوين محلك ضمن مناطق التوصيل المتاحة.</p><Link className="text-link" href="/account/addresses">إدارة العناوين</Link><hr /><form action={logoutAction}><button className="button button-secondary">تسجيل الخروج</button></form></aside></div>
  </AccountShell>;
}
