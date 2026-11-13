"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {Icon,type IconName} from "@/components/icon";
export type AdminNavItem={href:string;label:string;icon:IconName;group:string};
export function AdminNavigation({items}:{items:AdminNavItem[]}){
 const pathname=usePathname();
 return <nav aria-label="الإدارة" className="admin-nav" onFocus={event=>{if(event.target instanceof HTMLAnchorElement)event.target.scrollIntoView({block:"nearest",inline:"nearest",behavior:"instant"});}}>{items.map((item,index)=>{
  const active=item.href==="/admin"?pathname===item.href:pathname.startsWith(item.href);
  return <div key={item.href} className="admin-nav-item">{(index===0||items[index-1]?.group!==item.group)&&<p className="nav-group-label">{item.group}</p>}<Link href={item.href} aria-current={active?"page":undefined}><Icon name={item.icon}/><span>{item.label}</span>{active&&<span className="nav-active-dot"/>}</Link></div>;
 })}</nav>;
}
