"use client";
import {useState,useTransition} from "react";
import {previewPricing} from "@/app/admin/pricing/actions";
import {formatEgp} from "@/domain/money";
import {PricingTargetPicker} from "@/components/pricing-target-picker";
export function PricePreview(){const [result,setResult]=useState<{price?:number;label?:string;error?:string}>({});const [pending,start]=useTransition();return <form className="account-form form-panel" action={form=>start(async()=>setResult(await previewPricing(form)))}><h2>معاينة السعر المؤهل الآن</h2><PricingTargetPicker unitOnly/><input type="hidden" name="quantity" value="1"/><p className="field-hint">معاينة سعر وحدة الجملة؛ العرض لا يتغير حسب الكمية.</p><label>موبايل العميل (اختياري)<input name="phone" type="tel"/></label><button className="button" disabled={pending}>معاينة السعر</button>{result.error&&<p role="alert" className="form-error">{result.error}</p>}{result.price!==undefined&&<p role="status">{formatEgp(result.price)} للوحدة · {result.label}</p>}</form>;}
