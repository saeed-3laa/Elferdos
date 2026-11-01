import Image from "next/image";
import Link from "next/link";
import type {InvoiceData} from "@/server/orders/invoice";
import {formatEgp} from "@/domain/money";
import {orderStatusLabel} from "@/domain/orders";
import {formatDeliveryDate} from "@/domain/delivery";
export function Invoice({invoice:i}:{invoice:InvoiceData}){
 const payable=i.status==="CANCELLED"?0:i.total,balance=payable-i.paid,fullyReturned=i.items.length>0&&i.items.every(l=>l.quantity===0)&&i.items.some(l=>l.returned_quantity>0);
 return <article className="order-invoice" aria-label={`فاتورة الطلب ${i.number}`}>
 <header className="invoice-heading"><div><Image className="invoice-logo" src="/branding/ferdous-logo.png" width={2172} height={724} sizes="180px" alt="الفردوس لتجارة الجملة" /><p className="brand-slogan">جملة تسند شغلك</p><h2>فاتورة طلب رقم {i.number}</h2><p>الإسكندرية</p></div><div><strong>{fullyReturned?"مرتجع بالكامل":orderStatusLabel(i.status)}</strong><p>{new Date(i.created_at).toLocaleString("ar-EG",{timeZone:"Africa/Cairo"})}</p></div></header>
 <div className="invoice-customer"><section><h3>بيانات العميل</h3><p><strong>{i.customer.name}</strong></p><p>{i.customer.shop}</p><p><bdi>{i.customer.phone}</bdi></p><p>{i.address.zone} — {i.address.address}</p></section><section><h3>بيانات التوصيل</h3><p>{formatDeliveryDate(i.delivery_date)}</p>{i.address.notes&&<p>{i.address.notes}</p>}<p>رقم الفاتورة: <bdi>{i.number}</bdi></p></section></div>
 <div className="table-scroll"><table className="invoice-table"><thead><tr><th>الصنف</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>{i.items.map(line=><tr key={line.id}><td>{line.product_name}<small>{line.sku}{line.returned_quantity>0&&` · مرتجع: ${line.returned_quantity}`}</small></td><td>{line.unit_name}</td><td>{line.quantity}</td><td>{formatEgp(line.unit_price)}</td><td>{formatEgp(line.line_total)}</td></tr>)}</tbody></table></div>
 <div className="invoice-summary"><dl><div><dt>قبل الخصم</dt><dd>{formatEgp(i.base_total)}</dd></div><div><dt>الخصم</dt><dd>{formatEgp(i.base_total-i.subtotal)}</dd></div>{i.delivery_fee>0&&<div><dt>توصيل مسجل سابقًا</dt><dd>{formatEgp(i.delivery_fee)}</dd></div>}<div className="invoice-grand-total"><dt>الإجمالي</dt><dd>{formatEgp(i.total)}</dd></div><div><dt>صافي المبلغ المدفوع</dt><dd>{formatEgp(i.paid)}</dd></div><div><dt>{balance<0?"مستحق رده للعميل":"المتبقي للسداد"}</dt><dd>{formatEgp(Math.abs(balance))}</dd></div></dl></div>
 <footer>شكرًا لتعاملكم مع مخزن الفردوس{i.status==="CANCELLED"&&" — الطلب ملغي ولا يوجد مبلغ مطلوب سداده."}</footer>
 </article>;
}
export function InvoiceLinks({id}:{id:string}){return <div className="form-links no-print"><Link className="button button-secondary" href={`/invoices/${id}`} target="_blank" rel="noopener">عرض وطباعة الفاتورة</Link><a className="button button-secondary" href={`/invoices/${id}/pdf`} download>تحميل الفاتورة PDF</a></div>;}
