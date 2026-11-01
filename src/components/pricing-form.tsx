"use client";
import {useActionState} from "react";
import {savePricingRule} from "@/app/admin/pricing/actions";
export type PricingRule={id:string;revision:number;name:string;unit_id:string|null;product_id:string|null;category_id:string|null;customer_id:string|null;minimum_quantity:number;kind:string;value:number;starts_at:string;ends_at:string;active:boolean};
function date(value:string){return new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo"}).format(new Date(value));}
export function PricingForm({rule,targets,phone=""}:{rule?:PricingRule;targets:{value:string;label:string}[];phone?:string}){
 const [state,action,pending]=useActionState(savePricingRule,{});const current=rule?(rule.unit_id?`unit:${rule.unit_id}`:rule.product_id?`product:${rule.product_id}`:rule.category_id?`category:${rule.category_id}`:"all"):"all";
 return <form action={action} className="account-form"><input type="hidden" name="id" value={rule?.id??""}/><input type="hidden" name="revision" value={rule?.revision??0}/>{state.error&&<p className="form-error" role="alert">{state.error}</p>}{state.success&&<p role="status">{state.success}</p>}
 <label>اسم العرض أو شريحة السعر<input name="name" required maxLength={160} defaultValue={rule?.name}/></label>
 <label>نطاق القاعدة<select name="scope" defaultValue={current}><option value="all">كل المنتجات المؤهلة</option>{rule&&current!=="all"&&!targets.some(t=>t.value===current)&&<option value={current}>النطاق الحالي للقاعدة</option>}{targets.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
 <label>موبايل العميل (اختياري)<input name="customer_phone" type="tel" defaultValue={phone} placeholder="فاضي يعني كل العملاء"/></label><label>أقل عدد من وحدة البيع لتطبيق القاعدة<input name="minimum" type="number" min={1} max={100000} defaultValue={rule?.minimum_quantity??1} required/></label>
 <label>نوع القاعدة<select name="kind" defaultValue={rule?.kind??"percent"}><option value="percent">خصم نسبة من السعر الأساسي</option><option value="fixed">سعر ثابت لوحدة البيع بالجنيه</option></select></label><label>النسبة بالمئة أو السعر بالجنيه<input name="value" inputMode="decimal" required defaultValue={rule?String(rule.value/100):""}/></label>
 <div className="form-two-columns"><label>يبدأ يوم (القاهرة)<input type="date" name="starts" required defaultValue={rule?date(rule.starts_at):new Date().toISOString().slice(0,10)}/></label><label>ينتهي عند بداية يوم (غير مشمول)<input type="date" name="ends" required defaultValue={rule?date(rule.ends_at):""}/></label></div>
 <label className="checkbox-label"><input type="checkbox" name="active" defaultChecked={rule?.active??true}/>القاعدة مفعّلة</label><p className="field-hint">يُختار أقل سعر مؤهل دون جمع الخصومات. يمكن إنشاء شرائح متعددة بحدود كمية مختلفة.</p><button className="button" disabled={pending}>{pending?"جارٍ الحفظ…":rule?"حفظ قاعدة السعر":"إضافة قاعدة السعر"}</button></form>;
}
