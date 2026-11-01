"use client";

import Link from "next/link";
import {useEffect,useRef} from "react";
import {useCart} from "@/components/cart-provider";
import {QuantityStepper} from "@/components/quantity-stepper";
import {Icon} from "@/components/icon";

export function CartDrawer({open,onClose}:{open:boolean;onClose:()=>void}) {
 const {items,setItems}=useCart();const dialog=useRef<HTMLDialogElement>(null);
 const count=items.reduce((sum,item)=>sum+item.quantity,0);
 useEffect(()=>{
  const element=dialog.current;if(!element)return;
  if(!open){if(element.open)element.close();return;}
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const overflow=document.body.style.overflow;
  element.showModal();document.body.style.overflow="hidden";
  return ()=>{if(element.open)element.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
 },[open]);
 return <dialog ref={dialog} className="cart-drawer" aria-labelledby="cart-drawer-title" onCancel={onClose} onClose={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
  <div className="cart-drawer-panel">
   <header className="cart-drawer-header"><div><p className="eyebrow">كمّل طلبية محلك</p><h2 id="cart-drawer-title">سلتك</h2></div><button type="button" className="drawer-close" aria-label="إغلاق السلة" onClick={onClose} autoFocus>×</button></header>
   <div className="cart-drawer-body">
    {items.length===0?<div className="drawer-empty"><Icon name="cart"/><h3>السلة لسه فاضية</h3><p>اختار المنتجات وضيف وحدات الجملة اللي محتاجها.</p><button type="button" className="button button-secondary" onClick={onClose}>تصفح المنتجات</button></div>:
     <ul className="drawer-items">{items.map(item=><li key={item.unit_id}><div className="drawer-item-heading"><div><h3>{item.name??"منتج في السلة"}</h3><span>{item.unit_name??"وحدة جملة"}</span></div><button type="button" className="text-button" aria-label={`حذف ${item.name??"المنتج"} من السلة`} onClick={()=>setItems(items.filter(line=>line.unit_id!==item.unit_id))}>حذف</button></div><QuantityStepper label={`كمية السلة ${item.name??"المنتج"} ${item.unit_name??""}`} value={item.quantity} minimum={item.minimum_quantity??1} onChange={quantity=>{if(Number.isInteger(quantity)&&quantity>=(item.minimum_quantity??1)&&quantity<=100000)setItems(items.map(line=>line.unit_id===item.unit_id?{...line,quantity}:line));}}/></li>)}</ul>}
   </div>
   <footer className="cart-drawer-footer"><p className="drawer-count" role="status">{new Intl.NumberFormat("ar-EG").format(count)} وحدة جملة · {new Intl.NumberFormat("ar-EG").format(items.length)} صنف</p><p>السعر الخاص والعروض والتوصيل والتوافر بيتراجعوا في مراجعة الطلب. </p>{items.length>0&&<Link className="button" href="/cart" onClick={onClose}>مراجعة السلة <Icon name="arrow"/></Link>}<button type="button" className="text-button" onClick={onClose}>كمّل اختيار المنتجات</button></footer>
  </div>
 </dialog>;
}
