import "server-only";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {jsPDF} from "jspdf";
import type {InvoiceData} from "@/server/orders/invoice";
import {formatEgp} from "@/domain/money";
import {orderStatusLabel} from "@/domain/orders";
let font:Promise<string>|undefined;
let logo:Promise<Buffer>|undefined;
const money=(value:number)=>formatEgp(value).replace("ج.م.","جنيه");
const clean=(value:unknown)=>Array.from(String(value??""),char=>{const n=char.charCodeAt(0);if(n===0x061c||n===0x200e||n===0x200f||n===0xfeff)return "";return n<32||n===127||(n>=0x202a&&n<=0x202e)||(n>=0x2066&&n<=0x2069)?" ":char;}).join("").slice(0,2000);
export async function makeInvoicePdf(i:InvoiceData){
 font??=readFile(join(process.cwd(),"src/server/pdf/fonts/Amiri-Regular.ttf")).then(b=>b.toString("base64"));
 const pdf=new jsPDF({unit:"mm",format:"a4",compress:true,putOnlyUsedFonts:true});
 pdf.addFileToVFS("Amiri.ttf",await font);pdf.addFont("Amiri.ttf","Amiri","normal");pdf.setFont("Amiri");pdf.setProperties({title:`Invoice ${i.number}`,creator:"Al-Ferdous"});
 logo??=readFile(join(process.cwd(),"public/branding/ferdous-logo.png"));
 pdf.addImage(await logo,"PNG",142,10,54,18);
 let y=35;
 function page(height:number){if(y+height>275){pdf.addPage();pdf.setFont("Amiri");y=18;}}
 function text(value:unknown,x:number,top:number,size=12){const v=clean(value);pdf.setFontSize(size);pdf.setR2L(false);pdf.text(v,x,top,{align:"right",isInputVisual:false,isOutputVisual:true,isInputRtl:/[\u0600-\u06ff]/.test(v),isOutputRtl:false});}
 function block(value:unknown,size=12){pdf.setFontSize(size);const lines=pdf.splitTextToSize(clean(value),178) as string[];for(const line of lines){page(7);text(line,196,y,size);y+=7;}}
 pdf.setTextColor(49,73,135);block("جملة تسند شغلك",12);pdf.setTextColor(30,40,57);block(`فاتورة طلب رقم ${i.number}`,18);block(`الحالة: ${orderStatusLabel(i.status)}`);block(new Date(i.created_at).toLocaleString("ar-EG",{timeZone:"Africa/Cairo"}),11);y+=3;
 block(`العميل: ${i.customer.name}`);block(`المحل: ${i.customer.shop}`);page(7);text("الموبايل:",196,y);text(i.customer.phone,172,y);y+=7;block(`العنوان: ${i.address.zone} — ${i.address.address}`);y+=5;
 const edges=[196,120,96,80,48];const widths=[76,24,16,32,34];
 function header(){page(12);pdf.setFillColor(242,245,250);pdf.rect(14,y,182,10,"F");["الصنف","الوحدة","الكمية","سعر الوحدة","الإجمالي"].forEach((v,k)=>text(v,edges[k]!-2,y+6,11));y+=12;}
 header();
 for(const line of i.items){
  const values=[line.product_name+(line.returned_quantity>0?` — مرتجع: ${line.returned_quantity}`:""),line.unit_name,String(line.quantity),money(line.unit_price),money(line.line_total)];
  pdf.setFontSize(11);const rows=values.map((v,k)=>pdf.splitTextToSize(clean(v),widths[k]!-5) as string[]);const height=Math.max(...rows.map(r=>r.length))*5.5+5;
  if(y+height>275){pdf.addPage();pdf.setFont("Amiri");y=18;header();}
  rows.forEach((r,k)=>r.forEach((v,n)=>text(v,edges[k]!-2,y+4+n*5.5,11)));y+=height;pdf.setDrawColor(220,225,233);pdf.line(14,y-1,196,y-1);
 }
 y+=7;const payable=i.status==="CANCELLED"?0:i.total,balance=payable-i.paid;
 for(const [label,amount]of [["قبل الخصم",i.base_total],["الخصم",i.base_total-i.subtotal],...(i.delivery_fee>0?[["توصيل مسجل سابقًا",i.delivery_fee]]:[]),["الإجمالي",i.total],["صافي المدفوع",i.paid],[balance<0?"مستحق رده للعميل":"المتبقي للسداد",Math.abs(balance)]] as [string,number][]){page(10);text(label,196,y,13);text(money(amount),82,y,13);y+=9;}
 if(i.status==="CANCELLED")block("الطلب ملغي؛ لا يوجد مبلغ مطلوب سداده.");
 if(i.items.length&&i.items.every(l=>l.quantity===0)&&i.items.some(l=>l.returned_quantity>0))block("مرتجع بالكامل");
 page(12);y+=3;block("شكرًا لتعاملكم مع مخزن الفردوس",11);
 const count=pdf.getNumberOfPages();for(let n=1;n<=count;n++){pdf.setPage(n);text(`صفحة ${n} من ${count}`,196,289,10);}
 return Buffer.from(pdf.output("arraybuffer"));
}
