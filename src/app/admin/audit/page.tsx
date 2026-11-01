import Link from "next/link";
import { requireStaff } from "@/server/auth/staff";
import { formatEgp } from "@/domain/money";
import { StatusPanel } from "@/components/status-panel";

const labels:Record<string,string> = {products:"المنتجات",product_units:"وحدات البيع",categories:"الأقسام",delivery_zones:"مناطق التوصيل",store_settings:"الإعدادات",staff_assignments:"صلاحيات الموظفين",role_permissions:"قواعد الصلاحيات"};
const fields:Record<string,string> = {name:"الاسم",sku:"الكود",active:"التفعيل",available:"التوافر",price_piastres:"السعر",fee_piastres:"رسم التوصيل",pieces_per_unit:"محتوى الوحدة",minimum_quantity:"أقل كمية",free_delivery_above_piastres:"حد التوصيل المجاني",archived_at:"الأرشفة",role:"الدور"};
labels.product_images = "صور المنتجات";
Object.assign(labels,{orders:"الطلبات",order_payments:"التحصيل والرد",pricing_rules:"الأسعار والعروض",import_batches:"استيراد Excel",payment_settings:"بيانات الدفع",account_recovery:"استرجاع الحساب",customer_access:"إتاحة الحساب"});
Object.assign(fields,{status:"الحالة",amount:"المبلغ بالقروش",note:"الملاحظة",reason:"السبب",instapay_recipient:"بيانات إنستا باي",kind:"نوع القاعدة",value:"قيمة القاعدة بالقروش أو أجزاء بالمئة",starts_at:"بداية العرض",ends_at:"نهاية العرض",customer_id:"العميل",unit_id:"وحدة البيع",product_id:"المنتج",category_id:"القسم"});
fields.storage_path = "الصورة";
function display(key:string,value:unknown):string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (key === "storage_path") return "صورة مرفوعة";
  if (key.endsWith("piastres") && typeof value === "number") return formatEgp(value);
  if (key === "archived_at") return value ? "مؤرشف" : "غير مؤرشف";
  if (key === "stale_stock_policy") return value === "block" ? "منع" : "تحذير";
  return String(value);
}
type AuditRow = {id:number;entity:string;operation:string;created_at:string;actor_id:string|null;before_data:Record<string,unknown>|null;after_data:Record<string,unknown>|null};

export default async function AuditPage({ searchParams }: { searchParams:Promise<{after?:string;entity?:string}> }) {
  const { client } = await requireStaff("audit.read");
  const params = await searchParams;
  const after = typeof params.after === "string" && /^\d{1,16}$/.test(params.after) ? params.after : undefined;
  const entity = typeof params.entity === "string" && labels[params.entity] ? params.entity : "";
  let query = client.from("audit_logs").select("id,entity,operation,created_at,actor_id,before_data,after_data").order("id",{ascending:false}).limit(25);
  if (after) query = query.lt("id",after);
  if (entity) query = query.eq("entity",entity);
  const {data,error} = await query;
  if (error) throw new Error("AUDIT_UNAVAILABLE");
  const rows = (data as AuditRow[]).slice(0,24);
  const actorIds = [...new Set(rows.map((row)=>row.actor_id).filter((id):id is string=>!!id))];
  const actors = actorIds.length ? await client.from("profiles").select("id,full_name").in("id",actorIds) : {data:[],error:null};
  if (actors.error) throw new Error("AUDIT_ACTORS_UNAVAILABLE");
  return <><div className="account-title"><h1>سجل المراجعة</h1><p className="muted">التغييرات المسجلة على المنتجات والأسعار والمناطق والإعدادات والصلاحيات.</p></div>
    <form className="admin-filters" method="get"><label htmlFor="audit-entity">القسم<select id="audit-entity" name="entity" defaultValue={entity}><option value="">كل الأقسام</option>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><button className="button">تصفية</button></form>
    {!rows.length && <StatusPanel title="لا توجد تغييرات مطابقة"><p>ستظهر هنا التعديلات المسجلة في قاعدة البيانات.</p></StatusPanel>}
    <div className="audit-list">{rows.map((row)=><article className="form-panel" key={row.id}><div className="audit-heading"><h2>{labels[row.entity] ?? row.entity} · {row.operation === "INSERT" ? "إضافة" : row.operation === "UPDATE" ? "تعديل" : "حذف"}</h2><time>{new Intl.DateTimeFormat("ar-EG",{dateStyle:"short",timeStyle:"short",timeZone:"Africa/Cairo"}).format(new Date(row.created_at))}</time></div><p className="field-hint">بواسطة: {row.actor_id ? actors.data?.find((p)=>p.id===row.actor_id)?.full_name || "حساب موظف" : "إجراء إعداد أو نظام"}</p>
      <dl className="audit-changes">{Object.entries(fields).filter(([key])=>JSON.stringify(row.before_data?.[key])!==JSON.stringify(row.after_data?.[key])).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{display(key,row.before_data?.[key])} ← {display(key,row.after_data?.[key])}</dd></div>)}</dl>
    </article>)}</div>
    <div className="pagination">{after && <Link className="text-link" href={`/admin/audit?${new URLSearchParams({entity})}`}>أحدث التغييرات</Link>}{data.length>24 && <Link className="button" href={`/admin/audit?${new URLSearchParams({entity,after:String(rows.at(-1)!.id)})}`}>تغييرات أقدم</Link>}</div>
  </>;
}
