import Link from "next/link";
import {z} from "zod";
import {requireStaff} from "@/server/auth/staff";
import {formatEgp} from "@/domain/money";
function one<T>(value:T|T[]|null|undefined):T|undefined{return Array.isArray(value)?value[0]:value??undefined;}
export default async function Page({searchParams}:{searchParams:Promise<{after?:string;status?:string}>}){
 const {client}=await requireStaff("orders.read");const p=await searchParams;const status=z.enum(["REQUESTED","APPROVED","REJECTED"]).catch("REQUESTED").parse(p.status);
 let query=client.from("order_returns").select("id,order_id,reason,amount,status,created_at,orders(number,customer_snapshot)").eq("status",status).order("id").limit(25);if(z.uuid().safeParse(p.after).success)query=query.gt("id",p.after!);
 const result=await query;if(result.error)throw new Error("RETURNS_UNAVAILABLE");const rows=result.data.slice(0,24);
 return <><h1>مرتجعات الطلبات</h1><form className="admin-filters"><label>حالة المرتجع<select name="status" defaultValue={status}><option value="REQUESTED">تحت المراجعة</option><option value="APPROVED">معتمد</option><option value="REJECTED">مرفوض</option></select></label><button className="button">عرض المرتجعات</button></form>{!rows.length&&<p>لا توجد مرتجعات في هذه الحالة.</p>}<div className="reference-grid">{rows.map(r=><article className="form-panel" key={r.id}><h2>مرتجع طلب رقم {one(r.orders)?.number}</h2><p>{one(r.orders)?.customer_snapshot?.name}</p><p>{r.reason}</p><p>قيمة المرتجع: {formatEgp(r.amount)}</p><Link className="button button-secondary" href={`/admin/orders/${r.order_id}`}>مراجعة المرتجع وتفاصيل الطلب</Link></article>)}</div>{result.data.length>24&&<Link className="button" href={`/admin/returns?${new URLSearchParams({status,after:rows.at(-1)!.id})}`}>المرتجعات التالية</Link>}</>;
}
