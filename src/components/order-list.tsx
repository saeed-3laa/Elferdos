import { SearchInput } from "@/components/search-input";
import Link from "next/link";
import {requireCustomer} from "@/server/auth/customer";
import {requireStaff} from "@/server/auth/staff";
import {statusLabels,orderStatusLabel} from "@/domain/orders";
import {formatDeliveryDate} from "@/domain/delivery";
import {formatEgp} from "@/domain/money";
export async function OrderList({admin=false,params}:{admin?:boolean;params:Record<string,string|undefined>}){
 const {client}=admin?await requireStaff("orders.read"):await requireCustomer();const after=/^\d{1,15}$/.test(params.after??"")?Number(params.after):null;const status=(statusLabels[params.status??""]||params.status==="CANCELLED")?params.status!:"";const base=admin?"/admin/orders":"/account/orders";
 const from=/^\d{4}-\d{2}-\d{2}$/.test(params.from??"")?params.from:null;const to=/^\d{4}-\d{2}-\d{2}$/.test(params.to??"")?params.to:null;
 let query=client.from("orders").select("id,number,status,total,created_at,customer_snapshot,delivery_date").order("number",{ascending:false}).limit(25);if(after)query=query.lt("number",after);if(status)query=query.eq("status",status);
 const {data,error}=admin?await client.rpc("admin_orders",{p_after:after,p_status:status,p_search:(params.q??"").slice(0,160),p_from:from,p_to:to}):await query;
 if(error)throw new Error("ORDERS_UNAVAILABLE");const rows=(data as {id:string;number:number;status:string;total:number;created_at:string;delivery_date:string|null;customer_snapshot:{name:string}}[]).slice(0,24);
 return <><form method="get" className="admin-filters"><label>الحالة<select name="status" defaultValue={status}><option value="">كل الحالات</option><option value="CANCELLED">ملغي</option>{Object.entries(statusLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>{admin&&<><label>رقم الطلب أو اسم العميل أو الموبايل<SearchInput scope="orders" label="رقم الطلب أو اسم العميل أو الموبايل" maxLength={160} defaultValue={params.q}/></label><label>من يوم<input name="from" type="date" defaultValue={from??""}/></label><label>إلى يوم<input name="to" type="date" defaultValue={to??""}/></label></>}<button className="button">تصفية الطلبات</button></form>
 {!rows.length?<p>لا توجد طلبات مطابقة.</p>:<div className="table-scroll"><table className="admin-table"><thead><tr><th>الطلب</th><th>الحالة</th>{admin&&<th>العميل</th>}<th>الإجمالي</th><th>تاريخ الطلب</th><th>موعد التوصيل</th></tr></thead><tbody>{rows.map(o=><tr key={o.id}><td><Link className="text-link" href={`${base}/${o.id}`}>طلب {o.number}</Link></td><td>{orderStatusLabel(o.status)}</td>{admin&&<td>{o.customer_snapshot.name}</td>}<td>{formatEgp(o.total)}</td><td>{new Date(o.created_at).toLocaleDateString("ar-EG",{timeZone:"Africa/Cairo"})}</td><td>{formatDeliveryDate(o.delivery_date)}</td></tr>)}</tbody></table></div>}
 <div className="pagination">{after&&<Link href={base}>أحدث الطلبات</Link>}{data.length>24&&<Link className="button" href={`${base}?${new URLSearchParams({...Object.fromEntries(Object.entries(params).filter((pair):pair is [string,string]=>typeof pair[1]==="string")),after:String(rows.at(-1)!.number)})}`}>الطلبات التالية</Link>}</div></>;
}
