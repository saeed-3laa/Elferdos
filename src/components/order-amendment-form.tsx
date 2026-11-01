"use client";
import {useRef,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {formatEgp} from "@/domain/money";
import {type AmendmentQuote} from "@/domain/orders";
import {previewAmendment,saveAmendment} from "@/app/admin/order-actions";
import {AmendmentSummary} from "@/components/amendment-summary";
type Line={unit_id:string;product_name:string;unit_name:string;quantity:number;unit_price:number};
export function OrderAmendmentForm({id,revision,status,lines}:{id:string;revision:number;status:string;lines:Line[]}){
 const [items,setItems]=useState(lines.map(line=>({unit_id:line.unit_id,quantity:line.quantity}))),[reason,setReason]=useState("");
 const [quote,setQuote]=useState<AmendmentQuote|null>(null),[error,setError]=useState(""),[accepted,setAccepted]=useState(false);
 const [pending,start]=useTransition();const request=useRef<string|null>(null);const router=useRouter();
 function invalidate(){setQuote(null);setAccepted(false);setError("");request.current=null;}
 return <div className="account-form"><p className="field-hint">عدّل كميات أصناف الطلب، واكتب صفرًا أو اضغط حذف للصنف غير المتاح. سعر الوحدة المتفق عليه يفضل ثابت، والتوصيل يُحسب على الإجمالي الجديد بقاعدة وقت الطلب.</p>
 {status==="READY"&&<p className="form-error">تعديل طلب جاهز يرجعه «مؤكد» عشان تراجع التغيير وتجهّز الطلب من جديد.</p>}
 <div className="table-scroll"><table className="admin-table"><thead><tr><th>الصنف</th><th>الوحدة</th><th>سعر الوحدة</th><th>الكمية الجديدة</th><th/></tr></thead><tbody>{lines.map((line,index)=><tr key={line.unit_id}><td>{line.product_name}</td><td>{line.unit_name}</td><td>{formatEgp(line.unit_price)}</td><td><input type="number" aria-label={`كمية ${line.product_name} ${line.unit_name}`} min={0} max={100000} value={items[index]?.quantity??0} disabled={pending} onChange={event=>{const value=Number(event.target.value);if(Number.isInteger(value)&&value>=0&&value<=100000){setItems(current=>current.map(item=>item.unit_id===line.unit_id?{...item,quantity:value}:item));invalidate();}}}/></td><td><button className="text-button" disabled={pending} onClick={()=>{setItems(current=>current.map(item=>item.unit_id===line.unit_id?{...item,quantity:item.quantity===0?line.quantity:0}:item));invalidate();}}>{items[index]?.quantity===0?"استرجاع":"حذف"}</button></td></tr>)}</tbody></table></div>
 <label>سبب التعديل — هيظهر للعميل<textarea maxLength={500} minLength={3} value={reason} disabled={pending} onChange={event=>{setReason(event.target.value);invalidate();}} placeholder="مثال: المتاح كرتونتين بدل ٣ من الصنف ده"/></label>
 {error&&<p role="alert" className="form-error">{error}</p>}
 <button className="button button-secondary" disabled={pending||reason.trim().length<3} onClick={()=>start(async()=>{setError("");const result=await previewAmendment({order:id,revision,items});setQuote(result.quote??null);setError(result.error??"");})}>مراجعة التعديل والإجمالي</button>
 {quote&&<section className="form-panel"><h2>مراجعة تعديل الطلب</h2><AmendmentSummary quote={quote}/><label className="checkbox-label"><input type="checkbox" checked={accepted} disabled={pending} onChange={event=>setAccepted(event.target.checked)}/>راجعت التعديل وأوافق على تطبيقه وإشعار العميل</label><button className="button" disabled={pending||!accepted} onClick={()=>start(async()=>{request.current??=crypto.randomUUID();setError("");const result=await saveAmendment({order:id,revision,items,reason,expected:quote,request:request.current});if(result.id)router.push(`/admin/orders/${id}`);else setError(result.error??"تعذّر حفظ التعديل");})}>{pending?"جارٍ الحفظ…":"حفظ التعديل وإشعار العميل"}</button></section>}
 </div>;
}
