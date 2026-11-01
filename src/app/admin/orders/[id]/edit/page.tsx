import Link from "next/link";
import {notFound} from "next/navigation";
import {z} from "zod";
import {requireStaff} from "@/server/auth/staff";
import {OrderAmendmentForm} from "@/components/order-amendment-form";
export default async function Page({params}:{params:Promise<{id:string}>}){
 const {client}=await requireStaff("orders.write");const {id}=await params;if(!z.uuid().safeParse(id).success)notFound();
 const [order,lines]=await Promise.all([client.from("orders").select("id,number,status,revision").eq("id",id).maybeSingle(),client.from("order_items").select("unit_id,product_name,unit_name,quantity,unit_price").eq("order_id",id).order("id").limit(100)]);
 if(order.error||lines.error)throw new Error("ORDER_UNAVAILABLE");if(!order.data)notFound();
 return <><div className="account-title"><h1>تعديل طلب رقم {order.data.number}</h1><Link className="text-link" href={`/admin/orders/${id}`}>العودة للطلب</Link></div>{["CONFIRMED","READY"].includes(order.data.status)?<OrderAmendmentForm id={id} status={order.data.status} revision={order.data.revision} lines={lines.data}/>:<p className="form-error">الطلب المكتمل أو الملغي لا يقبل تعديل الأصناف.</p>}</>;
}
