import {AccountShell} from "@/components/account-shell";
import {OrderList} from "@/components/order-list";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){return <AccountShell title="طلباتي"><OrderList params={await searchParams}/></AccountShell>;}
