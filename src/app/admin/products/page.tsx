import Link from "next/link";
import { SearchInput } from "@/components/search-input";
import { z } from "zod";
import { requireStaff } from "@/server/auth/staff";
import { StatusPanel } from "@/components/status-panel";

const querySchema = z.object({ q: z.string().trim().max(100).catch(""), category: z.union([z.literal(""),z.uuid()]).catch(""), state: z.enum(["all","active","inactive","archived"]).catch("all"), sort: z.enum(["sku","name"]).catch("sku"), after: z.uuid().optional().catch(undefined) });
const rowSchema = z.object({ id:z.uuid(),sku:z.string(),name:z.string(),category_name:z.string(),active:z.boolean(),available:z.boolean(),archived_at:z.string().nullable(),unit_count:z.number().int() });

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const { client, access } = await requireStaff("catalog.read");
  const params = await searchParams;
  const q = querySchema.parse({ q:params.q ?? "", category:params.category ?? "", state:params.state, sort:params.sort, after:params.after });
  const [result,categories] = await Promise.all([
    client.rpc("admin_products_with_availability",{p_query:q.q,p_category:q.category || null,p_state:q.state,p_sort:q.sort,p_after:q.after ?? null,p_limit:25}),
    client.from("categories").select("id,name").order("name").limit(500),
  ]);
  if (result.error || categories.error) throw new Error("ADMIN_CATALOG_UNAVAILABLE");
  const allRows = z.array(rowSchema).parse(result.data);
  const rows = allRows.slice(0,24);
  const next = allRows.length>24 ? rows.at(-1)!.id : null;
  const url = (after?:string) => `/admin/products?${new URLSearchParams({q:q.q,category:q.category,state:q.state,sort:q.sort,...(after ? {after} : {})})}`;
  return <><div className="admin-heading"><div className="account-title"><h1>المنتجات</h1><p className="muted">بحث ومراجعة المنتجات والأسعار والتوافر اليدوي. التوافر مستقل عن تفعيل المنتج والقسم ووحدة البيع.</p></div>{access.permissions.includes("catalog.write") && <Link className="button" href="/admin/products/new">إضافة منتج</Link>}</div>
    <form method="get" action="/admin/products" className="admin-filters">
      <label>البحث<SearchInput scope="products" label="البحث" maxLength={100} defaultValue={q.q} placeholder="اسم المنتج أو الكود" /></label>
      <label htmlFor="filter-category">القسم<select id="filter-category" name="category" defaultValue={q.category}><option value="">كل الأقسام</option>{categories.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label htmlFor="filter-state">الحالة<select id="filter-state" name="state" defaultValue={q.state}><option value="all">كل الحالات</option><option value="active">نشط</option><option value="inactive">غير نشط</option><option value="archived">مؤرشف</option></select></label>
      <label htmlFor="filter-sort">الترتيب<select id="filter-sort" name="sort" defaultValue={q.sort}><option value="sku">حسب الكود</option><option value="name">حسب الاسم</option></select></label>
      <button className="button">تطبيق</button>
    </form>
    {!rows.length ? <StatusPanel title="لا توجد منتجات مطابقة"><p>غيّر البحث أو الفلاتر، أو أضف أول منتج إذا كانت لديك الصلاحية.</p></StatusPanel> : <div className="table-scroll"><table className="admin-table"><thead><tr><th>المنتج</th><th>الكود</th><th>القسم</th><th>وحدات الجملة</th><th>التوافر اليدوي</th><th>الحالة</th></tr></thead><tbody>{rows.map((p) => <tr key={p.id}><td><Link className="text-link" href={`/admin/products/${p.id}`}>{p.name}</Link></td><td><bdi>{p.sku}</bdi></td><td>{p.category_name}</td><td>{new Intl.NumberFormat("ar-EG").format(p.unit_count)}</td><td>{p.available ? "متوفر" : "غير متوفر"}</td><td>{p.archived_at ? "مؤرشف" : p.active ? "نشط" : "غير نشط"}</td></tr>)}</tbody></table></div>}
    <div className="pagination">{q.after && <Link className="text-link" href={url()}>العودة لأول النتائج</Link>}{next && <Link className="button" href={url(next)}>الصفحة التالية</Link>}</div>
  </>;
}
