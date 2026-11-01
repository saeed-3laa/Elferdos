import {OrderList} from "@/components/order-list";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){return <><h1>الطلبات</h1><OrderList admin params={await searchParams}/></>;}
