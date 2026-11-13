"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { loginAction, registerAction } from "@/app/auth-actions";
import { updateProfileAction, saveAddressAction, deleteAddressAction } from "@/app/account/actions";
import type { FormState } from "@/domain/accounts";

type ProfileValues = { full_name: string; shop_name: string; delivery_address: string; area: string; delivery_notes: string };
export type ZoneOption = { id: string; name: string };
export type SavedAddress = { id: string; zone_id: string; address: string; notes: string; is_default: boolean };

function FormMessage({ state }: { state: FormState }) {
  return <>{state.error && <p className="form-error" role="alert">{state.error}</p>}{state.success && <p className="form-success" role="status">{state.success}</p>}</>;
}

function useFieldErrors(state:FormState) {
  const id=useId();
  const ref=useRef<HTMLFormElement>(null);
  useEffect(()=>{if(state.fieldErrors)ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();},[state]);
  return {
    ref,
    field:(name:string)=>state.fieldErrors?.[name]?{"aria-invalid":true as const,"aria-describedby":id+"-"+name}:{},
    message:(name:string)=>state.fieldErrors?.[name]?<span className="form-error" id={id+"-"+name}>{state.fieldErrors[name]}</span>:null,
  };
}

function ProfileFields({ value, errors }: { value?: ProfileValues; errors:ReturnType<typeof useFieldErrors> }) {
  return <>
    <label>الاسم بالكامل<input name="full_name" required minLength={3} maxLength={160} autoComplete="name" defaultValue={value?.full_name} {...errors.field("full_name")}/>{errors.message("full_name")}</label>
    <label>اسم المحل<input name="shop_name" required minLength={2} maxLength={160} autoComplete="organization" defaultValue={value?.shop_name} {...errors.field("shop_name")}/>{errors.message("shop_name")}</label>
    <label>المنطقة داخل الإسكندرية<input name="area" required minLength={2} maxLength={100} autoComplete="address-level3" defaultValue={value?.area} {...errors.field("area")}/>{errors.message("area")}</label>
    <label>عنوان التوصيل التفصيلي<textarea name="delivery_address" required minLength={10} maxLength={1000} autoComplete="street-address" rows={3} defaultValue={value?.delivery_address} {...errors.field("delivery_address")}/>{errors.message("delivery_address")}</label>
    <label>ملاحظات التوصيل <span className="muted">(اختياري)</span><textarea name="delivery_notes" maxLength={1000} rows={2} defaultValue={value?.delivery_notes} {...errors.field("delivery_notes")}/>{errors.message("delivery_notes")}</label>
  </>;
}

export function AuthForm({ mode, checkout=false }: { mode: "login" | "register"; checkout?:boolean }) {
  const register = mode === "register";
  const [state, action, pending] = useActionState(register ? registerAction : loginAction, {});
  const errors=useFieldErrors(state);
  return <form ref={errors.ref} className="account-form" action={action}>
    <FormMessage state={state} />
    {checkout && <input type="hidden" name="next" value="cart"/>}
    {register && <ProfileFields errors={errors} />}
    <label>رقم الموبايل<input name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" required maxLength={32} placeholder="01012345678" {...errors.field("phone")}/>{errors.message("phone")}</label>
    <label>كلمة المرور<input name="password" type="password" autoComplete={register ? "new-password" : "current-password"} required minLength={register ? 12 : 1} maxLength={128} dir="auto" {...errors.field("password")}/>{errors.message("password")}</label>
    {register && <><p className="field-hint">استخدم كلمة مرور لا تقل عن ١٢ حرفًا. لا تشاركها مع أي شخص.</p><label>تأكيد كلمة المرور<input name="confirm_password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} {...errors.field("confirm_password")}/>{errors.message("confirm_password")}</label></>}
    <button type="submit" className="button" disabled={pending}>{pending ? "جارٍ التحقق…" : register ? "إنشاء الحساب" : "تسجيل الدخول"}</button>
  </form>;
}

export function ProfileForm({ profile }: { profile: ProfileValues }) {
  const [state, action, pending] = useActionState(updateProfileAction, {});
  const errors=useFieldErrors(state);
  return <form ref={errors.ref} action={action} className="account-form"><FormMessage state={state} /><ProfileFields value={profile} errors={errors} /><button className="button" disabled={pending}>{pending ? "جارٍ الحفظ…" : "حفظ البيانات"}</button></form>;
}

export function AddressForm({ zones, address, initialAddress }: { zones: ZoneOption[]; address?: SavedAddress; initialAddress?: {address:string;notes:string} }) {
  const [state, action, pending] = useActionState(saveAddressAction, {});
  const errors=useFieldErrors(state);
  const zoneId = useId();
  return <form ref={errors.ref} className="account-form" action={action}>
    <FormMessage state={state} />
    <input name="id" type="hidden" value={address?.id ?? ""} />
    <div><label htmlFor={zoneId}>منطقة التوصيل</label><select id={zoneId} name="zone_id" required defaultValue={address?.zone_id ?? ""} {...errors.field("zone_id")}><option value="" disabled>اختر المنطقة</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select>{errors.message("zone_id")}</div>
    <label>العنوان التفصيلي<textarea name="address" required minLength={10} maxLength={1000} defaultValue={address?.address??initialAddress?.address} rows={3} {...errors.field("address")}/>{errors.message("address")}</label>
    <label>ملاحظات العنوان <span className="muted">(اختياري)</span><textarea name="notes" maxLength={1000} defaultValue={address?.notes??initialAddress?.notes} rows={2} {...errors.field("notes")}/>{errors.message("notes")}</label>
    <label className="checkbox-label"><input key={String(address?.is_default)} type="checkbox" name="is_default" defaultChecked={address?.is_default} />العنوان الافتراضي</label>
    <button className="button" disabled={pending}>{pending ? "جارٍ الحفظ…" : address ? "حفظ العنوان" : "إضافة العنوان"}</button>
  </form>;
}

export function DeleteAddressForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(deleteAddressAction, {});
  return <form action={action} className="delete-address"><input type="hidden" name="id" value={id} /><FormMessage state={state} /><label className="checkbox-label"><input type="checkbox" required />تأكيد حذف هذا العنوان</label><button className="button button-danger" disabled={pending}>{pending ? "جارٍ الحذف…" : "حذف العنوان"}</button></form>;
}
