import "server-only";
import {cache} from "react";
import {notFound} from "next/navigation";
import {z} from "zod";
import {requireAccount,requireCustomer} from "@/server/auth/customer";
import {requireStaff} from "@/server/auth/staff";
export type InvoiceData={id:string;number:number;status:string;created_at:string;delivery_date:string|null;customer:{name:string;shop:string;phone:string};address:{zone:string;address:string;notes:string};base_total:number;subtotal:number;delivery_fee:number;total:number;paid:number;items:{id:string;product_name:string;sku:string;unit_name:string;quantity:number;returned_quantity:number;unit_price:number;line_total:number}[]};
export const loadInvoice=cache(async(id:string):Promise<InvoiceData>=>{
 if(!z.uuid().safeParse(id).success)notFound();
 const account=await requireAccount();const session=account.profile.account_kind==="STAFF"?await requireStaff("orders.read"):await requireCustomer();
 const order=await session.client.from("orders").select("id,number,status,created_at,delivery_date,customer_snapshot,address_snapshot,base_total,subtotal,delivery_fee,total,customer_id").eq("id",id).maybeSingle();
 if(order.error)throw new Error("INVOICE_UNAVAILABLE");if(!order.data)notFound();
 if(account.profile.account_kind!=="STAFF"&&order.data.customer_id!==account.user.id)notFound();
 const [items,payments]=await Promise.all([session.client.from("order_items").select("id,product_name,sku,unit_name,quantity,returned_quantity,unit_price,line_total").eq("order_id",id).order("id").limit(100),session.client.from("order_payments").select("amount").eq("order_id",id).limit(200)]);
 if(items.error||payments.error)throw new Error("INVOICE_UNAVAILABLE");const o=order.data;
 return {id:o.id,number:o.number,status:o.status,created_at:o.created_at,delivery_date:o.delivery_date,customer:o.customer_snapshot,address:o.address_snapshot,base_total:o.base_total,subtotal:o.subtotal,delivery_fee:o.delivery_fee,total:o.total,paid:payments.data.reduce((n,p)=>n+p.amount,0),items:items.data};
});
