import Link from "next/link";
import {AccountShell} from "@/components/account-shell";
import {requireCustomer} from "@/server/auth/customer";
import {AmendmentSummary} from "@/components/amendment-summary";
import {ReadNotification} from "@/components/read-notification";
import type {AmendmentQuote} from "@/domain/orders";
type Notification={id:number;title:string;message:string;order_id:string;read_at:string|null;created_at:string;order_amendments:{changes:AmendmentQuote["changes"];before_total:number;after_total:number;after_fee:number}|null};
export default async function Page({searchParams}:{searchParams:Promise<{after?:string}>}){
 const {client,user}=await requireCustomer();const params=await searchParams;const after=/^\d{1,15}$/.test(params.after??"")?params.after:null;
 let query=client.from("customer_notifications").select("id,title,message,order_id,read_at,created_at,order_amendments(changes,before_total:before_data->total,after_total:after_data->total,after_fee:after_data->delivery_fee)").eq("customer_id",user.id).order("id",{ascending:false}).limit(25);
 if(after)query=query.lt("id",after);const result=await query;if(result.error)throw new Error("NOTIFICATIONS_UNAVAILABLE");
 const rows=(result.data as unknown as Notification[]).slice(0,24);
 return <AccountShell title="إشعارات الطلبات" intro="مواعيد التوصيل وتعديلات الطلب بتوصلك هنا بتفاصيلها."><div className="notification-list">{!rows.length&&<section className="form-panel"><h2>لا توجد إشعارات حاليًا</h2><Link className="text-link" href="/account/orders">عرض طلباتي</Link></section>}{rows.map(notification=><article className={`form-panel notification-card ${notification.read_at?"":"notification-unread"}`} key={notification.id}><h2>{notification.title}</h2><p>{notification.message}</p><small>{new Date(notification.created_at).toLocaleString("ar-EG",{timeZone:"Africa/Cairo"})}</small>{notification.order_amendments&&<AmendmentSummary quote={{changes:notification.order_amendments.changes,before:{total:notification.order_amendments.before_total},after:{total:notification.order_amendments.after_total,delivery_fee:notification.order_amendments.after_fee}}}/>}<div className="form-links"><Link href={`/account/orders/${notification.order_id}`} className="text-link">{notification.order_amendments?"عرض الطلب بعد التعديل":"عرض تفاصيل الطلب"}</Link>{!notification.read_at&&<ReadNotification id={String(notification.id)}/>}</div></article>)}</div><div className="pagination">{after&&<Link href="/account/notifications">أحدث الإشعارات</Link>}{result.data.length>24&&<Link className="button" href={`/account/notifications?after=${rows.at(-1)!.id}`}>الإشعارات التالية</Link>}</div></AccountShell>;
}
