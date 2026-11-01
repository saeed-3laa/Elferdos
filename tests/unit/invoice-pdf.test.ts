import {describe,it,expect} from "vitest";
import {writeFile} from "node:fs/promises";
import {makeInvoicePdf} from "@/server/pdf/invoice-pdf";
import type {InvoiceData} from "@/server/orders/invoice";
function invoice(lines:number):InvoiceData{return {id:"sample",number:123,status:"DELIVERED",created_at:"2026-10-29T10:00:00Z",delivery_date:"2026-10-30",customer:{name:"عميل اختبار",shop:"محل تجريبي",phone:"+201012345678"},address:{zone:"الإسكندرية",address:"عنوان تجريبي لا يخص أي عميل",notes:""},base_total:lines*20000,subtotal:lines*20000,delivery_fee:0,total:lines*20000,paid:lines*30000,items:Array.from({length:lines},(_,n)=>({id:String(n),product_name:lines>1?"منتج جملة تجريبي باسم طويل لاختبار التفاف النص داخل مساحة الصنف بالفاتورة دون تداخل مع الوحدة والكمية والأسعار":"منتج تجريبي",sku:"QA-"+n,unit_name:"كرتونة",quantity:2,returned_quantity:1,unit_price:10000,line_total:20000}))};}
describe("printable invoice PDF",()=>{
 for(const lines of [1,100])it(`generates an embedded-font invoice with ${lines} lines and paginates long tables`,async()=>{
  const bytes=await makeInvoicePdf(invoice(lines));expect(bytes.subarray(0,5).toString()).toBe("%PDF-");
  const source=bytes.toString("latin1"),pages=(source.match(/\/Type \/Page\b/g)??[]).length;
  expect(pages).toBeGreaterThanOrEqual(1);if(lines===1)expect(pages).toBe(1);else expect(pages).toBeGreaterThan(1);
  expect(source).toContain("/FontFile2");expect(source).toContain("/Subtype /Image");expect(bytes.length).toBeLessThan(2*1024*1024);
  if(process.env.INVOICE_PDF_QA==="1")await writeFile(`test-results/invoice-${lines}-lines-qa.pdf`,bytes);
 });
});
