import Link from "next/link";
import { z } from "zod";
import { requireStaff } from "@/server/auth/staff";
import { ReferenceForm } from "@/components/admin-forms";
import type { AdminReference } from "@/domain/admin";

export default async function ZonesPage({ searchParams }: { searchParams: Promise<{ after?: string }> }) {
  const { client } = await requireStaff("settings.write");
  const cursor = z.uuid().safeParse((await searchParams).after);
  let query = client.from("delivery_zones").select("id,name,active,revision").order("id").limit(25);
  if (cursor.success) query = query.gt("id", cursor.data);
  const { data, error } = await query;
  if (error) throw new Error("ZONES_UNAVAILABLE");
  return <><div className="account-title"><h1>مناطق التوصيل</h1><p className="muted">أضف مناطق الإسكندرية المتاحة للتوصيل. التوصيل مجاني لكل المناطق ولكل الطلبات.</p></div>
    <section className="form-panel new-reference"><h2>منطقة جديدة</h2><ReferenceForm kind="zone" /></section>
    <div className="reference-grid">{(data as AdminReference[]).slice(0,24).map((zone) => <section className="form-panel" key={zone.id}><h2>{zone.name}</h2><ReferenceForm kind="zone" record={zone} /></section>)}</div>
    <div className="pagination">{cursor.success && <Link className="text-link" href="/admin/zones">أول المناطق</Link>}{data.length>24 && <Link className="button" href={`/admin/zones?after=${data[23]!.id}`}>المناطق التالية</Link>}</div>
    {!data.length && <p className="muted">لم تضف مناطق بعد؛ أضف المناطق المتاحة لتحديد عناوين التوصيل.</p>}
  </>;
}
