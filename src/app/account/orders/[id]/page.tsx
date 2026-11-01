import {AccountShell} from "@/components/account-shell";
import {OrderDetails} from "@/components/order-details";
export default async function Page({params}:{params:Promise<{id:string}>}){return <AccountShell title="تفاصيل الطلب"><OrderDetails id={(await params).id}/></AccountShell>;}
