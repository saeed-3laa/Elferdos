"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useCart} from "@/components/cart-provider";
import {Icon} from "@/components/icon";
export function CartLink(){
 const {items,ready,openCart}=useCart();const path=usePathname();const count=ready?items.reduce((total,item)=>total+item.quantity,0):0;
 const content=<><Icon name="cart"/><span>السلة</span><b className="cart-count">{new Intl.NumberFormat("ar-EG").format(count)}</b></>;
 return path==="/cart"?<Link href="/cart" className="header-cart" aria-label="السلة">{content}</Link>:<button type="button" className="header-cart" aria-label="السلة" aria-haspopup="dialog" onClick={openCart}>{content}</button>;
}
export function MobileStoreNavigation(){
 const path=usePathname();const {openCart}=useCart();
 return <div className="mobile-store-nav" aria-label="اختصارات المتجر">
  {[{href:"/",icon:"grid" as const,label:"المتجر"},{href:"/account/orders",icon:"box" as const,label:"طلباتي"},{href:"/cart",icon:"cart" as const,label:"السلة"},{href:"/account",icon:"user" as const,label:"حسابي"}].map(item=>item.href==="/cart"&&path!=="/cart"?<button key={item.href} type="button" aria-label="فتح السلة" aria-haspopup="dialog" onClick={openCart}><Icon name={item.icon}/><span>{item.label}</span></button>:<Link key={item.href} href={item.href} aria-label={`فتح ${item.label}`} aria-current={path===item.href?"page":undefined}><Icon name={item.icon}/><span>{item.label}</span></Link>)}
 </div>;
}
