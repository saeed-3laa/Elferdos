"use client";
import Image from "next/image";
import {useActionState} from "react";
import {enrollMfa,verifyMfa} from "@/app/security/mfa/actions";
export function MfaForm({factor}:{factor?:string}){
 const [enrollment,enroll,enrolling]=useActionState(enrollMfa,{});const [state,verify,pending]=useActionState(verifyMfa,{});
 const selected=factor??enrollment.factor;
 return <div className="form-panel">{!factor&&<><h2>ربط تطبيق التحقق</h2><p>استخدم تطبيق Authenticator على موبايلك. رمز QR خاص بحسابك؛ ما تشاركوش أو تحفظه في مكان عام.</p>{enrollment.error&&<p role="alert" className="form-error">{enrollment.error}</p>}{!enrollment.factor&&<form action={enroll}><button className="button" disabled={enrolling}>تجهيز رمز الربط</button></form>}{enrollment.qr&&<Image src={enrollment.qr} alt="رمز ربط تطبيق التحقق الخاص بحسابك" width={220} height={220} unoptimized/>}</>}{selected&&<form action={verify} className="account-form"><h2>رمز تطبيق التحقق</h2>{state.error&&<p role="alert" className="form-error">{state.error}</p>}<input name="factor" type="hidden" value={selected}/><label>رمز التحقق<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required dir="ltr"/></label><button className="button" disabled={pending}>تأكيد الرمز والدخول</button></form>}</div>;
}
