import {NextResponse} from "next/server";
import {loadInvoice} from "@/server/orders/invoice";
import {makeInvoicePdf} from "@/server/pdf/invoice-pdf";
import {allowWorkload} from "@/server/auth/workload-limit";
import {requireAccount} from "@/server/auth/customer";
export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const invoice=await loadInvoice(id);const {user}=await requireAccount();
 if(!await allowWorkload("export",user.id))return NextResponse.json({error:"تحميل متكرر. حاول لاحقًا."},{status:429,headers:{"Cache-Control":"private, no-store","Retry-After":"900"}});
 const pdf=await makeInvoicePdf(invoice);return new NextResponse(new Uint8Array(pdf),{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="ferdous-invoice-${invoice.number}.pdf"`,"Cache-Control":"private, no-store","Vary":"Cookie"}});
}
