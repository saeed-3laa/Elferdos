"use client";
import {useActionState,useEffect,useId,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {transitionOrder,recordPayment} from "@/app/admin/order-actions";
import {statusLabels,nextStatus,type CartItem} from "@/domain/orders";
import {useCart} from "@/components/cart-provider";
import {formatEgp} from "@/domain/money";
export function OrderTransition({id,revision,status,staff,remaining=0,method="cash",request}:{id:string;revision:number;status:string;staff:boolean;remaining?:number;method?:string;request:string}){
 const [state,action,pending]=useActionState(transitionOrder,{});const next=nextStatus[status];
 if(!staff||!next)return null;
 return <form action={action} className="account-form form-panel"><h2>تحديث حالة الطلب</h2>{state.error&&<p role="alert" className="form-error">{state.error}</p>}{state.success&&<p role="status">{state.success}</p>}
 <input type="hidden" name="order" value={id}/><input type="hidden" name="revision" value={revision}/><div><label htmlFor={`status-${id}`}>الحالة الجديدة</label><select id={`status-${id}`} name="status"><option value={next}>{statusLabels[next]}</option></select></div>
 {next==="DELIVERED"?<><input name="request" type="hidden" value={request}/><input name="remaining" type="hidden" value={remaining}/><p>باقي المبلغ للتحصيل: <strong>{formatEgp(remaining)}</strong></p><label>طريقة استلام باقي المبلغ<select name="method" defaultValue={method}><option value="cash">كاش</option><option value="instapay">إنستا باي</option></select></label><label className="checkbox-label"><input name="received" type="checkbox" required/>أؤكد استلام باقي مبلغ الطلب بالكامل</label><p className="field-hint">هيتسجل باقي التحصيل ويتم إتمام الطلب مرة واحدة.</p></>:<p className="field-hint">اختار جاهز بعد مراجعة الأصناف وتجهيز الطلب.</p>}
 <label>ملاحظة أو مرجع التحصيل<input name="note" maxLength={200}/></label><button className="button" disabled={pending}>{pending?"جارٍ الحفظ…":next==="DELIVERED"?"تأكيد التحصيل وتم التسليم":"حفظ الحالة"}</button></form>;
}
export function PaymentForm({id,request,refundOnly=false}:{id:string;request:string;refundOnly?:boolean}){const [state,action,pending]=useActionState(recordPayment,{});
 return <form action={action} className="account-form form-panel"><h2>تسجيل تحصيل أو رد مبلغ</h2>{state.error&&<p role="alert" className="form-error">{state.error}</p>}{state.success&&<p role="status">{state.success}</p>}
 <input type="hidden" name="order" value={id}/><input type="hidden" name="request" value={request}/><label>نوع الحركة<select name="direction" defaultValue={refundOnly?"refund":"receive"}>{!refundOnly&&<option value="receive">تحصيل فعلي</option>}<option value="refund">رد مبلغ للعميل</option></select></label><label>المبلغ بالجنيه<input name="amount" inputMode="decimal" required/></label>
 <label>طريقة الدفع<select name="method"><option value="cash">كاش</option><option value="instapay">إنستا باي</option></select></label><label>مرجع أو سبب الحركة<input name="reference" maxLength={200} required/></label><p className="field-hint">سجّل فقط المبالغ المحصلة أو المردودة فعليًا.</p><button className="button" disabled={pending}>{pending?"جارٍ التسجيل…":"تأكيد حركة الدفع"}</button></form>;
}
export function Reorder({items}:{items:CartItem[]}){
 const {items:currentCart,setItems,ready}=useCart();const router=useRouter();
 const [confirming,setConfirming]=useState(false);const dialog=useRef<HTMLDialogElement>(null);
 const titleId=useId(),descriptionId=useId();
 useEffect(()=>{
  const element=dialog.current;if(!confirming||!element)return;
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const overflow=document.body.style.overflow;
  element.showModal();document.body.style.overflow="hidden";
  return ()=>{if(element.open)element.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
 },[confirming]);
 function replaceCart(){setConfirming(false);setItems(items);router.push("/cart");}
 return <><button type="button" className="button button-secondary" disabled={!ready} aria-haspopup={currentCart.length?"dialog":undefined} onClick={()=>{if(currentCart.length)setConfirming(true);else replaceCart();}}>إعادة الطلب بأسعار اليوم</button>
  <dialog ref={dialog} className="reorder-confirmation" role="alertdialog" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={()=>setConfirming(false)} onClose={()=>setConfirming(false)}>
   <h2 id={titleId}>استبدال السلة الحالية؟</h2>
   <p id={descriptionId}>سلتك تحتوي على أصناف بالفعل. إعادة الطلب ستستبدل جميع محتويات السلة الحالية بأصناف هذا الطلب. الأسعار والتوافر يُراجعان في السلة قبل إرسال الطلب.</p>
   <div className="form-links"><button type="button" className="button button-secondary" autoFocus onClick={()=>setConfirming(false)}>الاحتفاظ بالسلة الحالية</button><button type="button" className="button" onClick={replaceCart}>استبدال السلة وإعادة الطلب</button></div>
  </dialog>
 </>;
}
