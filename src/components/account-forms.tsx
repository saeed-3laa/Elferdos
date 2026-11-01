"use client";

import { useActionState, useId } from "react";
import { loginAction, registerAction } from "@/app/auth-actions";
import { updateProfileAction, saveAddressAction, deleteAddressAction } from "@/app/account/actions";
import type { FormState } from "@/domain/accounts";

type ProfileValues = { full_name: string; shop_name: string; delivery_address: string; area: string; delivery_notes: string };
export type ZoneOption = { id: string; name: string };
export type SavedAddress = { id: string; zone_id: string; address: string; notes: string; is_default: boolean };

function FormMessage({ state }: { state: FormState }) {
  return <>{state.error && <p className="form-error" role="alert">{state.error}</p>}{state.success && <p className="form-success" role="status">{state.success}</p>}</>;
}

function ProfileFields({ value }: { value?: ProfileValues }) {
  return <>
    <label>الاسم بالكامل<input name="full_name" required minLength={3} maxLength={160} autoComplete="name" defaultValue={value?.full_name} /></label>
    <label>اسم المحل<input name="shop_name" required minLength={2} maxLength={160} autoComplete="organization" defaultValue={value?.shop_name} /></label>
    <label>المنطقة داخل الإسكندرية<input name="area" required minLength={2} maxLength={100} autoComplete="address-level3" defaultValue={value?.area} /></label>
    <label>عنوان التوصيل التفصيلي<textarea name="delivery_address" required minLength={10} maxLength={1000} autoComplete="street-address" rows={3} defaultValue={value?.delivery_address} /></label>
    <label>ملاحظات التوصيل <span className="muted">(اختياري)</span><textarea name="delivery_notes" maxLength={1000} rows={2} defaultValue={value?.delivery_notes} /></label>
  </>;
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const register = mode === "register";
  const [state, action, pending] = useActionState(register ? registerAction : loginAction, {});
  return <form className="account-form" action={action}>
    <FormMessage state={state} />
    {register && <ProfileFields />}
    <label>رقم الموبايل<input name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" required maxLength={32} placeholder="01012345678" /></label>
    <label>كلمة المرور<input name="password" type="password" autoComplete={register ? "new-password" : "current-password"} required minLength={register ? 12 : 1} maxLength={128} dir="auto" /></label>
    {register && <><p className="field-hint">استخدم كلمة مرور لا تقل عن ١٢ حرفًا. لا تشاركها مع أي شخص.</p><label>تأكيد كلمة المرور<input name="confirm_password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label></>}
    <button type="submit" className="button" disabled={pending}>{pending ? "جارٍ التحقق…" : register ? "إنشاء الحساب" : "تسجيل الدخول"}</button>
  </form>;
}

export function ProfileForm({ profile }: { profile: ProfileValues }) {
  const [state, action, pending] = useActionState(updateProfileAction, {});
  return <form action={action} className="account-form"><FormMessage state={state} /><ProfileFields value={profile} /><button className="button" disabled={pending}>{pending ? "جارٍ الحفظ…" : "حفظ البيانات"}</button></form>;
}

export function AddressForm({ zones, address, initialAddress }: { zones: ZoneOption[]; address?: SavedAddress; initialAddress?: {address:string;notes:string} }) {
  const [state, action, pending] = useActionState(saveAddressAction, {});
  const zoneId = useId();
  return <form className="account-form" action={action}>
    <FormMessage state={state} />
    <input name="id" type="hidden" value={address?.id ?? ""} />
    <div><label htmlFor={zoneId}>منطقة التوصيل</label><select id={zoneId} name="zone_id" required defaultValue={address?.zone_id ?? ""}><option value="" disabled>اختر المنطقة</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></div>
    <label>العنوان التفصيلي<textarea name="address" required minLength={10} maxLength={1000} defaultValue={address?.address??initialAddress?.address} rows={3} /></label>
    <label>ملاحظات العنوان <span className="muted">(اختياري)</span><textarea name="notes" maxLength={1000} defaultValue={address?.notes??initialAddress?.notes} rows={2} /></label>
    <label className="checkbox-label"><input key={String(address?.is_default)} type="checkbox" name="is_default" defaultChecked={address?.is_default} />العنوان الافتراضي</label>
    <button className="button" disabled={pending}>{pending ? "جارٍ الحفظ…" : address ? "حفظ العنوان" : "إضافة العنوان"}</button>
  </form>;
}

export function DeleteAddressForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(deleteAddressAction, {});
  return <form action={action} className="delete-address"><input type="hidden" name="id" value={id} /><FormMessage state={state} /><label className="checkbox-label"><input type="checkbox" required />تأكيد حذف هذا العنوان</label><button className="button button-danger" disabled={pending}>{pending ? "جارٍ الحذف…" : "حذف العنوان"}</button></form>;
}
