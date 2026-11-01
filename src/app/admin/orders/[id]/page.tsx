import {OrderDetails} from "@/components/order-details";
export default async function Page({params}:{params:Promise<{id:string}>}){return <OrderDetails id={(await params).id} admin/>;}
