"use client";
import {useEffect,useState,type ReactNode} from "react";
import {Icon} from "@/components/icon";

export function CatalogView({children,featured}:{children:ReactNode;featured?:ReactNode}) {
 const [view,setView]=useState("grid");
 useEffect(()=>{try {if(localStorage.getItem("ferdous-catalog-view")==="list")setView("list");}catch{/* Browsing still works without storage. */}},[]);
 function select(next:string){setView(next);try{localStorage.setItem("ferdous-catalog-view",next);}catch{/* Preference is optional. */}}
 return <div className="catalog-results" data-view={view}><div className="catalog-view-toolbar"><span>اختار طريقة العرض اللي تريحك</span><div role="group" aria-label="طريقة عرض المنتجات"><button type="button" aria-pressed={view==="grid"} onClick={()=>select("grid")}><Icon name="grid"/>شبكة</button><button type="button" aria-pressed={view==="list"} onClick={()=>select("list")}><Icon name="menu"/>قائمة مختصرة</button></div></div>{featured&&<section className="offers-shelf" id="current-offers" aria-labelledby="current-offers-title"><div className="offers-shelf-heading"><span><Icon name="tag"/></span><div><h3 id="current-offers-title">عروض سارية لمحلك</h3><p>سعر أوفر، على كل الكميات المسموحة.</p></div></div><div className="product-grid">{featured}</div></section>}<div className="product-grid">{children}</div></div>;
}
