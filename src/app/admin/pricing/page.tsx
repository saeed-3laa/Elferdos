import Link from "next/link";
import { requireStaff } from "@/server/auth/staff";
import { PricingForm, type PricingRule } from "@/components/pricing-form";
import { z } from "zod";
import { PricePreview } from "@/components/price-preview";
import { Icon } from "@/components/icon";
export default async function Page({ searchParams }: { searchParams: Promise<{ after?: string }> }) {
  const { client } = await requireStaff("catalog.write"), params = await searchParams;
  let query = client.from("pricing_rules").select("*").order("id").limit(25);
  if (z.uuid().safeParse(params.after).success) query = query.gt("id", params.after!);
  const rules = await query;
  if (rules.error) throw new Error("PRICING_UNAVAILABLE");
  const rows = rules.data.slice(0, 24) as PricingRule[];
  const ids = (key: "product_id" | "category_id" | "unit_id" | "customer_id") => rows.map(rule => rule[key]).filter((id): id is string => !!id);
  // Resolve only the current page's saved targets; selection searches independently.
  const [products, categories, units, profiles] = await Promise.all([
    ids("product_id").length ? client.from("products").select("id,name,sku").in("id", ids("product_id")) : { data: [], error: null },
    ids("category_id").length ? client.from("categories").select("id,name").in("id", ids("category_id")) : { data: [], error: null },
    ids("unit_id").length ? client.from("product_units").select("id,name").in("id", ids("unit_id")) : { data: [], error: null },
    ids("customer_id").length ? client.from("profiles").select("id,phone").in("id", ids("customer_id")) : { data: [], error: null },
  ]);
  if (products.error || categories.error || units.error || profiles.error) throw new Error("PRICING_TARGETS_UNAVAILABLE");
  function targetLabel(rule: PricingRule) {
    const product = products.data?.find(item => item.id === rule.product_id);
    return product ? product.name + " (" + product.sku + ")" : categories.data?.find(item => item.id === rule.category_id)?.name ?? units.data?.find(item => item.id === rule.unit_id)?.name ?? "";
  }
  return <><div className="section-heading"><div><h1>الأسعار والعروض</h1><p>منتج أو قسم كامل، بسعر أفضل خلال المدة اللي تحددها.</p></div><Icon name="tag" /></div>
    <p className="pricing-intro">بدون شرائح كميات. العروض العامة السارية تظهر أول المتجر، وأفضل سعر مؤهل يفوز دون جمع الخصومات.</p>
    <div className="reference-grid"><section className="form-panel"><h2>عرض جديد</h2><PricingForm /></section><PricePreview /></div>
    <div className="section-heading"><h2>العروض المحفوظة</h2></div>
    {!rows.length && <p className="form-panel">لسه مفيش عروض. أضف أول عرض من النموذج بالأعلى.</p>}
    <div className="reference-grid">{rows.map(rule => <section key={rule.id} className="form-panel"><h2>{rule.name}</h2><PricingForm rule={rule} targetLabel={targetLabel(rule)} phone={profiles.data?.find(profile => profile.id === rule.customer_id)?.phone ?? ""} /></section>)}</div>
    <div className="pagination">{params.after && <Link href="/admin/pricing">أول العروض</Link>}{rules.data.length > 24 && <Link className="button" href={"/admin/pricing?after=" + rows.at(-1)!.id}>العروض التالية</Link>}</div></>;
}
