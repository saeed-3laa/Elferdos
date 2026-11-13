"use client";
import {useId,useState} from "react";

export function QuantityStepper({value,onChange,minimum=1,maximum=100000,label,disabled=false,commitOnBlur=false}:{
 value:number;onChange:(value:number)=>void;minimum?:number;maximum?:number;label:string;disabled?:boolean;commitOnBlur?:boolean;
}) {
 const valid=Number.isInteger(value);const [draft,setDraft]=useState<string|null>(null);
 const [error,setError]=useState(false);const errorId=useId();
 function commit(){
  setDraft(null);
  if(!commitOnBlur||draft===null)return;
  const quantity=Number(draft);
  if(!draft||!Number.isInteger(quantity)||quantity<minimum||quantity>maximum){setError(true);return;}
  setError(false);
  if(quantity!==value)onChange(quantity);
 }
 return <><div className="quantity-stepper" dir="ltr">
  <button type="button" aria-label={`تقليل ${label}`} disabled={disabled||(valid&&value<=minimum)} onClick={()=>{setDraft(null);setError(false);onChange(valid?Math.max(minimum,value-1):minimum);}}>−</button>
  <input aria-label={label} type="number" min={minimum} max={maximum} step={1} value={draft??(Number.isNaN(value)?"":value)} disabled={disabled} aria-describedby={error?errorId:undefined} onBlur={commit} onKeyDown={e=>{if(commitOnBlur&&e.key==="Enter"){e.preventDefault();commit();}}} onChange={e=>{setDraft(e.target.value);setError(false);if(!commitOnBlur)onChange(e.target.value===""?NaN:Number(e.target.value));}}/>
  <button type="button" aria-label={`زيادة ${label}`} disabled={disabled||(valid&&value>=maximum)} onClick={()=>{setDraft(null);setError(false);onChange(valid?Math.max(minimum,Math.min(maximum,value+1)):minimum);}}>+</button>
 </div>{error&&<p id={errorId} className="form-error" role="alert">الكمية لازم تكون رقمًا صحيحًا من {minimum} إلى {maximum}. تم الاحتفاظ بالكمية السابقة.</p>}</>;
}
