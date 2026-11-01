"use client";
import {startTransition,useActionState} from "react";
import {scheduleDelivery} from "@/app/admin/order-actions";
import {formatDeliveryDate} from "@/domain/delivery";
export function DeliveryScheduleForm({id,revision,date,choices}:{id:string;revision:number;date:string|null;choices:{date:string;label:string}[]}){
 const [state,action,pending]=useActionState(scheduleDelivery,{});
 return <form className="account-form form-panel" action={action} onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);startTransition(()=>action(data));}}>
  <h2>تحديد يوم التوصيل</h2><p>الموعد الحالي: {formatDeliveryDate(date)}</p>
  {state.error&&<p role="alert" className="form-error">{state.error}</p>}{state.success&&<p role="status" className="form-success">{state.success}</p>}
  <input name="order" type="hidden" value={id}/><input name="revision" type="hidden" value={revision}/>
  <label htmlFor={`delivery-${id}`}>يوم التوصيل</label><select id={`delivery-${id}`} key={`${revision}:${date}`} name="date" required defaultValue={choices.some(c=>c.date===date)?date!:""}><option value="" disabled>اختار يوم التوصيل</option>{choices.map(choice=><option key={choice.date} value={choice.date}>{choice.label} — {formatDeliveryDate(choice.date)}</option>)}</select>
  <p className="field-hint">حسب توقيت الإسكندرية. الموعد بيظهر للعميل وبيوصله إشعار داخل حسابه؛ حالة الطلب تفضل مستقلة.</p>
  <button className="button" disabled={pending}>{pending?"جارٍ حفظ الموعد…":"حفظ موعد التوصيل"}</button>
 </form>;
}
