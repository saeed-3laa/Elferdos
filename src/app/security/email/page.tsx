import Link from "next/link";
import {redirect} from "next/navigation";
import {requireAccount} from "@/server/auth/customer";
import {AccountShell} from "@/components/account-shell";
import {StaffEmailForm} from "@/components/staff-email-form";
import {finishStaffEmail} from "./actions";
export default async function Page(){const {profile,client}=await requireAccount();if(profile.account_kind!=="STAFF")redirect("/account");const access=await client.rpc("get_staff_access");const local=["localhost","127.0.0.1"].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname);return <AccountShell title="تأكيد بريد الإدارة" intro="لا نعتمد البريد للدخول قبل تأكيد ملكيته من الرسالة المرسلة إليه.">{local&&<p className="field-hint">في نسخة التجربة تُحفظ رسالة التأكيد في صندوق البريد المحلي؛ لا تُرسل إلى Gmail. يلزم تشغيل خدمة البريد الحقيقية قبل تأكيد بريد المالك.</p>}{access.data?.email_ready?<form className="form-panel" action={finishStaffEmail}><p>البريد موثّق. أكمل التحويل لإلغاء جلسات الدخول السابقة.</p><button className="button">اعتماد الدخول بالبريد</button></form>:<StaffEmailForm email={profile.login_email??""}/>}<p><Link href="/admin/profile">الرجوع لحسابي</Link></p></AccountShell>}
