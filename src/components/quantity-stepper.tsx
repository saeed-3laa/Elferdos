"use client";
import {useState} from "react";

export function QuantityStepper({value,onChange,minimum=1,maximum=100000,label,disabled=false}:{
 value:number;onChange:(value:number)=>void;minimum?:number;maximum?:number;label:string;disabled?:boolean;
}) {
 const valid=Number.isInteger(value);const [draft,setDraft]=useState<string|null>(null);
 return <div className="quantity-stepper" dir="ltr">
  <button type="button" aria-label={`تقليل ${label}`} disabled={disabled||(valid&&value<=minimum)} onClick={()=>{setDraft(null);onChange(valid?Math.max(minimum,value-1):minimum);}}>−</button>
  <input aria-label={label} type="number" min={minimum} max={maximum} step={1} value={draft??(Number.isNaN(value)?"":value)} disabled={disabled} onBlur={()=>setDraft(null)} onChange={e=>{setDraft(e.target.value);onChange(e.target.value===""?NaN:Number(e.target.value));}}/>
  <button type="button" aria-label={`زيادة ${label}`} disabled={disabled||(valid&&value>=maximum)} onClick={()=>{setDraft(null);onChange(valid?Math.min(maximum,value+1):minimum);}}>+</button>
 </div>;
}
