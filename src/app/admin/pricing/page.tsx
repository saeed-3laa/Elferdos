import { SearchInput } from "@/components/search-input";
import Link from "next/link";
import {requireStaff} from "@/server/auth/staff";
import {PricingForm,type PricingRule} from "@/components/pricing-form";
import {z} from "zod";
import {PricePreview} from "@/components/price-preview";
export default async function Page({searchParams}:{searchParams:Promise<{q?:string;after?:string}>}){
 const {client}=await requireStaff("catalog.write");const params=await searchParams;let query=client.from("pricing_rules").select("*").order("id").limit(25);if(z.uuid().safeParse(params.after).success)query=query.gt("id",params.after!);
 const [rules,products,categories]=await Promise.all([query,client.rpc("admin_products",{p_query:(params.q??"").slice(0,100),p_limit:25,p_state:"all"}),client.from("categories").select("id,name").order("name").limit(500)]);
 if(rules.error||products.error||categories.error)throw new Error("PRICING_UNAVAILABLE");const rows=rules.data.slice(0,24) as PricingRule[];
 const productRows=products.data as {id:string;name:string;sku:string}[];const units=productRows.length?await client.from("product_units").select("id,name,product_id").in("product_id",productRows.map(p=>p.id)).limit(500):{data:[],error:null};if(units.error)throw new Error("UNITS_UNAVAILABLE");
 const customerIds=rows.map(r=>r.customer_id).filter((id):id is string=>!!id);const profiles=customerIds.length?await client.from("profiles").select("id,phone").in("id",customerIds):{data:[],error:null};if(profiles.error)throw new Error("CUSTOMERS_UNAVAILABLE");
 const targets=[...categories.data.map(c=>({value:`category:${c.id}`,label:`قسم: ${c.name}`})),...productRows.map(p=>({value:`product:${p.id}`,label:`منتج: ${p.name} (${p.sku})`})),...(units.data??[]).map(u=>({value:`unit:${u.id}`,label:`وحدة: ${productRows.find(p=>p.id===u.product_id)?.name} — ${u.name}`}))];
 return <><h1>العروض والأسعار وشرائح الكميات</h1><form className="admin-filters"><label>ابحث عن منتج لاختياره في القواعد<SearchInput scope="pricing" label="ابحث عن منتج لاختياره في القواعد" defaultValue={params.q} maxLength={100}/></label><button className="button">تحميل المنتجات المطابقة</button></form><p>القواعد الخاصة بالعميل تُحدد برقم الموبايل. أقل سعر مؤهل يفوز، ولا تُجمع الخصومات.</p>
 <div className="reference-grid"><section className="form-panel"><h2>قاعدة جديدة</h2><PricingForm targets={targets}/></section><PricePreview units={(units.data??[]).map(u=>({id:u.id,name:`${productRows.find(p=>p.id===u.product_id)?.name} — ${u.name}`}))}/></div><div className="reference-grid">{rows.map(rule=><section key={rule.id} className="form-panel"><h2>{rule.name}</h2><PricingForm rule={rule} targets={targets} phone={profiles.data?.find(p=>p.id===rule.customer_id)?.phone??""}/></section>)}</div>
 <div className="pagination">{params.after&&<Link href="/admin/pricing">أول القواعد</Link>}{rules.data.length>24&&<Link className="button" href={`/admin/pricing?after=${rows.at(-1)!.id}`}>القواعد التالية</Link>}</div></>;
}
