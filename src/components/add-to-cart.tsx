"use client";
import {useState} from "react";
import {useCart} from "@/components/cart-provider";
import {QuantityStepper} from "@/components/quantity-stepper";
import {Icon} from "@/components/icon";
export function AddToCart({id,name,unit,minimum,available}:{id:string;name:string;unit:string;minimum:number;available:boolean}) {
 const {items,ready,setItems}=useCart();const [quantity,setQuantity]=useState(minimum);const [message,setMessage]=useState("");
 return <div className="cart-add"><div className="cart-quantity"><span>الكمية ({unit})</span><QuantityStepper label={`كمية ${name} ${unit}`} value={quantity} minimum={minimum} disabled={!available} onChange={next=>{setQuantity(next);setMessage("");}}/></div>
 <div className="cart-action"><button type="button" className="button" disabled={!ready||!available||!Number.isInteger(quantity)||quantity<minimum||quantity>100000} onClick={()=>{
  const old=items.find(item=>item.unit_id===id);
  if(!old&&items.length>=100){setMessage("السلة بتشيل حتى ١٠٠ صنف. راجعها قبل إضافة صنف جديد.");return;}
  if(old&&old.quantity+quantity>100000){setMessage("الكمية تجاوزت الحد المسموح للصنف. راجع كمية السلة.");return;}
  setItems(old?items.map(item=>item.unit_id===id?{...item,quantity:item.quantity+quantity,minimum_quantity:minimum}:item):[...items,{unit_id:id,quantity,name,unit_name:unit,minimum_quantity:minimum}]);setMessage("تمت الإضافة للسلة");
 }}><Icon name="cart"/>{available?"إضافة للسلة":"غير متوفر حاليًا"}</button></div><p className="cart-add-feedback" role="status">{message}</p></div>;
}
