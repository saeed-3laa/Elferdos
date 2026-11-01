import {once} from "node:events";
import {PassThrough,Readable} from "node:stream";
import ExcelJS from "exceljs";
import {NextResponse} from "next/server";
import {requireStaff} from "@/server/auth/staff";
import {allowWorkload} from "@/server/auth/workload-limit";
import {readExportPage} from "@/server/excel/export-page";
export const runtime="nodejs";
function one<T>(value:T|T[]|null|undefined):T|undefined{return Array.isArray(value)?value[0]:value??undefined;}
function dataError(code?:string){return new Error("EXPORT_DATA_UNAVAILABLE:"+(/^[A-Z0-9_]{1,32}$/.test(code??"")?code:"UNKNOWN"));}
export async function GET(request:Request){
 const kind=new URL(request.url).searchParams.get("kind");if(kind!=="customers"&&kind!=="products")return NextResponse.json({error:"نوع تقرير غير صحيح"},{status:400});
 const session=await requireStaff(kind==="customers"?"customers.read":"catalog.read");
 if(!await allowWorkload("export",session.user.id))return NextResponse.json({error:"تحميل متكرر. حاول لاحقًا."},{status:429,headers:{"Retry-After":"900","Cache-Control":"private, no-store"}});
 const stream=new PassThrough();const stop=()=>stream.destroy(new Error("EXPORT_ABORTED"));request.signal.addEventListener("abort",stop,{once:true});
 const workbook=new ExcelJS.stream.xlsx.WorkbookWriter({stream,useStyles:true,useSharedStrings:false});workbook.creator="Al-Ferdous";
 const headings=kind==="customers"?["معرّف العميل","اسم العميل","اسم المحل","رقم الموبايل","المنطقة","العنوان","نشط"]:["معرّف المنتج","الكود","المنتج","القسم","وحدة الجملة","قطع داخل الوحدة","سعر الوحدة جنيه","التوافر اليدوي","المنتج نشط","الوحدة نشطة"];
 let sheet=workbook.addWorksheet("البيانات",{views:[{rightToLeft:true,state:"frozen",ySplit:1}]});let sheetNumber=1;
 function header(){sheet.columns=headings.map(h=>({header:h,width:h.includes("عنوان")?45:24}));sheet.getRow(1).font={bold:true};sheet.getRow(1).commit();}header();
 function add(values:(string|number|null)[]){if(sheet.rowCount>=1048575){sheet.commit();sheet=workbook.addWorksheet(`البيانات ${++sheetNumber}`,{views:[{rightToLeft:true}]});header();}sheet.addRow(values).commit();}
 const completion=(async()=>{
  let after="";
  for(;;){if(stream.destroyed)throw new Error("EXPORT_ABORTED");
   if(kind==="customers"){
    let query=session.client.from("profiles").select("id,full_name,shop_name,phone,area,delivery_address,active,customer_addresses(address,is_default)").eq("account_kind","CUSTOMER").eq("customer_addresses.is_default",true).order("id").limit(500);if(after)query=query.gt("id",after);const r=await readExportPage(()=>query,request.signal);if(r.error)throw dataError(r.error.code);
    for(const row of r.data)add([row.id,row.full_name,row.shop_name,row.phone,row.area,row.delivery_address||row.customer_addresses[0]?.address||"",row.active?"نعم":"لا"]);
    if(stream.writableNeedDrain)await once(stream,"drain");if(r.data.length<500)break;after=r.data.at(-1)!.id;
   }else{
    let query=session.client.from("products").select("id,sku,name,active,available,categories(name),product_units(name,pieces_per_unit,price_piastres,active)").order("id").limit(200);if(after)query=query.gt("id",after);const r=await readExportPage(()=>query,request.signal);if(r.error)throw dataError(r.error.code);
    for(const row of r.data){const units=row.product_units.length?row.product_units:[null];for(const u of units)add([row.id,row.sku,row.name,one(row.categories)?.name??"",u?.name??"لم تحدد وحدة",u?.pieces_per_unit??null,u?u.price_piastres/100:null,row.available?"متوفر":"غير متوفر",row.active?"نعم":"لا",u?(u.active?"نعم":"لا"):null]);}
    if(stream.writableNeedDrain)await once(stream,"drain");if(r.data.length<200)break;after=r.data.at(-1)!.id;
   }
  }
  sheet.commit();const notes=workbook.addWorksheet("تعليمات",{views:[{rightToLeft:true}]});notes.addRow(["المبالغ بالجنيه. البيانات تُقرأ أثناء التصدير وقد تتغير البيانات خلال التحميل."]).commit();if(kind==="products")notes.addRow(["التوافر اليدوي هو علم المنتج فقط؛ قبول الطلب يتطلب أيضًا منتجًا غير مؤرشف وقسمًا ووحدة بيع مفعّلين والتحقق من الحساب والعنوان والكمية. عدد القطع وصف للتعبئة وليس رصيدًا."]).commit();notes.commit();await workbook.commit();
 })();
 void completion.catch((error:unknown)=>{const code=error instanceof Error&&/^(EXPORT_ABORTED|EXPORT_DATA_UNAVAILABLE:[A-Z0-9_]{1,32})$/.test(error.message)?error.message:"EXPORT_FAILED";console.error("Report export stopped:",kind,code);stream.destroy(new Error("EXPORT_FAILED"));}).finally(()=>request.signal.removeEventListener("abort",stop));
 return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>,{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="ferdous-all-${kind}.xlsx"`,"Cache-Control":"private, no-store","Vary":"Cookie"}});
}
