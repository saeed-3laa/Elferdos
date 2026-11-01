import Link from "next/link";
import { z } from "zod";
import { requireStaff } from "@/server/auth/staff";
import { ReferenceForm } from "@/components/admin-forms";
import type { AdminReference } from "@/domain/admin";

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ after?: string }> }) {
  const { client } = await requireStaff("catalog.write");
  const cursor = z.uuid().safeParse((await searchParams).after);
  let query = client.from("categories").select("id,name,active,revision").order("id").limit(25);
  if (cursor.success) query = query.gt("id", cursor.data);
  const { data, error } = await query;
  if (error) throw new Error("CATEGORIES_UNAVAILABLE");
  return <><div className="account-title"><h1>أقسام المنتجات</h1><p className="muted">تعطيل القسم يخفي منتجاته من الكتالوج العام.</p></div>
    <section className="form-panel new-reference"><h2>قسم جديد</h2><ReferenceForm kind="category" /></section>
    <div className="reference-grid">{(data as AdminReference[]).slice(0,24).map((category) => <section className="form-panel" key={category.id}><h2>{category.name}</h2><ReferenceForm kind="category" record={category} /></section>)}</div>
    <div className="pagination">{cursor.success && <Link className="text-link" href="/admin/categories">أول الأقسام</Link>}{data.length>24 && <Link className="button" href={`/admin/categories?after=${data[23]!.id}`}>الأقسام التالية</Link>}</div>
    {!data.length && <p className="muted">لم تضف أقسامًا بعد.</p>}
  </>;
}
