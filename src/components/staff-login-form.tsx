"use client";
import {useActionState} from "react";
import {staffLoginAction} from "@/app/auth-actions";
export function StaffLoginForm(){const [state,action,pending]=useActionState(staffLoginAction,{});return <form action={action} className="account-form">{state.error&&<p role="alert" className="form-error">{state.error}</p>}<label>البريد الإلكتروني<input name="email" type="email" autoComplete="username" dir="ltr" maxLength={254} required/></label><label>كلمة المرور<input name="password" type="password" autoComplete="current-password" maxLength={128} required/></label><button className="button" disabled={pending}>{pending?"جارٍ التحقق…":"تسجيل الدخول"}</button></form>}
