import {requireAccount} from "@/server/auth/customer";
import Link from "next/link";
import {loadInvoice} from "@/server/orders/invoice";
import {Invoice} from "@/components/invoice";
import {InvoicePrintButton} from "@/components/invoice-print-button";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;const invoice=await loadInvoice(id);const {profile}=await requireAccount();return <main className="invoice-page" id="main"><div className="invoice-toolbar no-print"><InvoicePrintButton/><a className="button button-secondary" href={`/invoices/${id}/pdf`} download>تحميل الفاتورة PDF</a><Link className="text-link" href={profile.account_kind==="STAFF"?`/admin/orders/${invoice.id}`:`/account/orders/${invoice.id}`}>الرجوع للطلب</Link></div><Invoice invoice={invoice}/></main>;}
