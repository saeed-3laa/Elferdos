import Link from "next/link";
import { requireStaff } from "@/server/auth/staff";
import { ProductForm } from "@/components/admin-forms";
import { StatusPanel } from "@/components/status-panel";

export default async function NewProductPage() {
  const { client } = await requireStaff("catalog.write");
  const { data, error } = await client.from("categories").select("id,name,active,revision").order("name").limit(500);
  if (error) throw new Error("CATEGORIES_UNAVAILABLE");
  return <><div className="account-title"><h1>إضافة منتج</h1><p className="muted">ابدأ ببيانات المنتج، ثم أضف وحدات الجملة وأسعارها وتحدد التوافر.</p></div>
    {data.length ? <section className="form-panel auth-panel"><ProductForm categories={data} /></section> : <StatusPanel title="أضف قسمًا أولًا"><Link className="text-link" href="/admin/categories">إدارة الأقسام</Link></StatusPanel>}
  </>;
}
