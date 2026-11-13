"use client";
import {useActionState} from "react";
import {savePricingRule} from "@/app/admin/pricing/actions";
import {PricingTargetPicker} from "@/components/pricing-target-picker";
import {offerDate} from "@/domain/offers";
export type PricingRule={id:string;revision:number;name:string;unit_id:string|null;product_id:string|null;category_id:string|null;customer_id:string|null;minimum_quantity:number;kind:string;value:number;starts_at:string;ends_at:string;active:boolean};
export function PricingForm({rule,targetLabel="",phone=""}:{rule?:PricingRule;targetLabel?:string;phone?:string}){
 const [state,action,pending]=useActionState(savePricingRule,{});const current=rule?(rule.unit_id?`unit:${rule.unit_id}`:rule.product_id?`product:${rule.product_id}`:rule.category_id?`category:${rule.category_id}`:"all"):"all";
 return <form action={action} className="account-form"><input type="hidden" name="id" value={rule?.id??""}/><input type="hidden" name="revision" value={rule?.revision??0}/>{state.error&&<p className="form-error" role="alert">{state.error}</p>}{state.success&&<p role="status">{state.success}</p>}
 {rule&&rule.minimum_quantity>1&&<p className="form-error">شريحة كمية قديمة متوقفة عن التسعير. حفظها يحولها لعرض بدون شرط كمية.</p>}
 <label>اسم العرض<input name="name" required maxLength={160} defaultValue={rule?.name}/></label>
 <PricingTargetPicker initialScope={current} initialLabel={targetLabel}/>
 <label>موبايل العميل (اختياري)<input name="customer_phone" type="tel" dir="ltr" defaultValue={phone} placeholder="فاضي يعني كل العملاء"/></label>
 <label>نوع القاعدة<select name="kind" defaultValue={rule?.kind??"percent"}><option value="percent">خصم نسبة من السعر الأساسي</option><option value="fixed">سعر ثابت لوحدة البيع بالجنيه</option></select></label><label>النسبة بالمئة أو السعر بالجنيه<input name="value" inputMode="decimal" required defaultValue={rule?String(rule.value/100):""}/></label>
 <div className="form-two-columns"><label>من يوم (القاهرة)<input type="date" name="starts" required defaultValue={rule?offerDate(rule.starts_at):offerDate(new Date().toISOString())}/></label><label>إلى نهاية يوم (القاهرة)<input type="date" name="ends" required defaultValue={rule?offerDate(rule.ends_at,true):""}/></label></div>
 <label className="checkbox-label"><input type="checkbox" name="active" defaultChecked={rule?.active??true}/>العرض مفعّل</label><p className="field-hint">العرض لكل الكميات المسموحة خلال المدة المحددة. أفضل سعر يفوز دون جمع الخصومات. العرض الخاص بعميل لا يظهر للزوار.</p><button className="button" disabled={pending}>{pending?"جارٍ الحفظ…":rule?"حفظ العرض":"إضافة العرض"}</button></form>;
}
