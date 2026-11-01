"use client";

import { useActionState, useId } from "react";
import { archiveProduct, saveProduct, saveReference, saveUnit } from "@/app/admin/actions";
import { egpInput, type AdminProduct, type AdminReference, type AdminUnit } from "@/domain/admin";
import type { FormState } from "@/domain/accounts";

function Message({ state }: { state: FormState }) { return <>{state.error && <p className="form-error" role="alert">{state.error}</p>}{state.success && <p className="form-success" role="status">{state.success}</p>}</>; }
function Identity({ record }: { record?: { id: string; revision: number } }) { return <><input type="hidden" name="id" value={record?.id ?? ""} /><input type="hidden" name="revision" value={record?.revision ?? 0} /></>; }

export function ReferenceForm({ kind, record }: { kind: "category" | "zone"; record?: AdminReference }) {
  const [state, action, pending] = useActionState(saveReference, {});
  return <form className="account-form reference-form" action={action}>
    <Message state={state} /><Identity record={record} /><input name="kind" type="hidden" value={kind} />
    <label>{kind === "zone" ? "اسم المنطقة" : "اسم القسم"}<input name="name" required maxLength={100} defaultValue={record?.name} /></label>
    <label className="checkbox-label"><input name="active" type="checkbox" defaultChecked={record?.active ?? true} />مفعّل</label>
    <button className="button" disabled={pending}>{pending ? "جارٍ الحفظ…" : record ? "حفظ التعديل" : kind === "zone" ? "إضافة المنطقة" : "إضافة القسم"}</button>
  </form>;
}

export function ProductForm({ product, categories }: { product?: AdminProduct; categories: AdminReference[] }) {
  const [state, action, pending] = useActionState(saveProduct, {});
  const categoryId = useId();
  const availabilityId = useId();
  return <form action={action} className="account-form product-editor">
    <Message state={state} /><Identity record={product} />
    <label>اسم المنتج<input name="name" required maxLength={200} defaultValue={product?.name} /></label>
    <label>كود المنتج<input name="sku" dir="ltr" maxLength={64} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" placeholder="اختياري" defaultValue={product?.sku} /></label>
    <p className="field-hint">{product ? "لو سيبت الكود فاضي، هنحتفظ بكود المنتج الحالي." : "سيبه فاضي وهنعمل كود تلقائي للمنتج، أو اكتب كودك لو موجود."}</p>
    <div><label htmlFor={categoryId}>القسم</label><select id={categoryId} name="category_id" required defaultValue={product?.category_id ?? ""}><option value="" disabled>اختر القسم</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}{category.active ? "" : " (غير مفعّل)"}</option>)}</select></div>
    <label>وصف المنتج<textarea name="description" maxLength={4000} rows={3} defaultValue={product?.description} /></label>
    <label className="checkbox-label"><input type="checkbox" name="active" defaultChecked={product?.active ?? false} />نشط في الكتالوج</label>
    <div><label htmlFor={availabilityId}>التوافر</label><select id={availabilityId} name="available" defaultValue={product?.available===false?"false":"true"}><option value="true">متوفر</option><option value="false">غير متوفر</option></select></div>
    <p className="field-hint">المنتج الجديد متوفر افتراضيًا. لن يظهر للعملاء إلا بعد إضافة وحدة جملة مفعّلة وتفعيل القسم والمنتج.</p>
    <button className="button" disabled={pending}>{pending ? "جارٍ الحفظ…" : product ? "حفظ المنتج" : "إنشاء المنتج"}</button>
  </form>;
}

export function UnitForm({ productId, unit }: { productId: string; unit?: AdminUnit }) {
  const [state, action, pending] = useActionState(saveUnit, {});
  return <form action={action} className="account-form unit-editor">
    <Message state={state} /><Identity record={unit} /><input name="product_id" type="hidden" value={productId} />
    <label>اسم وحدة الجملة<input name="name" required maxLength={80} defaultValue={unit?.name} placeholder="كرتونة أو بالتة" /></label>
    <div className="form-two-columns"><label>عدد القطع داخل الوحدة<input type="number" name="pieces" min={2} max={1000000} step={1} required defaultValue={unit?.pieces_per_unit ?? 24} /></label>
    <label>السعر بالجنيه<input name="price" inputMode="decimal" required defaultValue={egpInput(unit?.price_piastres ?? 0)} /></label></div>
    <label>أقل عدد وحدات للطلب<input name="minimum" type="number" min={1} max={100000} step={1} required defaultValue={unit?.minimum_quantity ?? 1} /></label>
    <label className="checkbox-label"><input name="active" type="checkbox" defaultChecked={unit?.active ?? true} />الوحدة مفعّلة للبيع</label>
    <p className="field-hint">السعر مستقل لكل وحدة. عدد القطع يوضح محتوى العبوة.</p>
    <button className="button" disabled={pending}>{pending ? "جارٍ الحفظ…" : unit ? "حفظ الوحدة" : "إضافة وحدة الجملة"}</button>
  </form>;
}

export function ArchiveForm({ product }: { product: AdminProduct }) {
  const [state, action, pending] = useActionState(archiveProduct, {});
  return <form action={action} className="account-form"><Message state={state} /><Identity record={product} /><input type="hidden" name="archived" value={product.archived_at ? "false" : "true"} />
    <label className="checkbox-label"><input type="checkbox" name="confirmed" required />{product.archived_at ? "تأكيد إلغاء الأرشفة" : "تأكيد أرشفة المنتج وإخفائه من الكتالوج"}</label>
    <button className="button button-danger" disabled={pending}>{pending ? "جارٍ التحديث…" : product.archived_at ? "إلغاء الأرشفة" : "أرشفة المنتج"}</button>
  </form>;
}

