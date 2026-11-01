"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {requireStaff} from "@/server/auth/staff";
import {readImportWorkbook} from "@/server/excel/workbook";
import {parseEgpInput} from "@/domain/admin";
import {allowWorkload} from "@/server/auth/workload-limit";
type ImportState={error?:string;errors?:string[];batch?:string;rows?:Record<string,unknown>[];success?:string};
export async function previewImport(_state:ImportState,form:FormData):Promise<ImportState>{
 if(form.get("kind")!=="products")return {error:"المتاح استيراد المنتجات والأسعار فقط."};const kind="products";const {client,user}=await requireStaff("catalog.write");const file=form.get("file");if(!(file instanceof File)||file.size>5*1024*1024)return {error:"اختار ملف XLSX حتى ٥ ميجابايت."};
 if(!await allowWorkload("import",user.id))return {error:"محاولات استيراد كثيرة. حاول بعد ربع ساعة."};
 try{const raw=await readImportWorkbook(Buffer.from(await file.arrayBuffer()));const rows:Record<string,unknown>[]=[];const errors:string[]=[];const seen=new Set<string>();
 type Existing={id:string;sku:string;revision:number;archived_at:string|null;units:{id:string;name:string;revision:number;pieces_per_unit:number}[]};
 const context=await client.rpc("import_context",{p_kind:kind,p_skus:[...new Set(raw.map(r=>(r.values[0]??"").toUpperCase()))],p_categories:[...new Set(raw.map(r=>r.values[2]??""))]});if(context.error)return {error:"تعذّر تحميل بيانات فحص الملف."};const known=context.data as {products:Existing[];categories:{id:string;name:string}[]};const productMap=new Map(known.products.map(p=>[p.sku,p]));const categoryMap=new Map(known.categories.map(c=>[c.name,c]));
 for(const {row,values:v}of raw){try{const sku=(v[0]??"").toUpperCase();if(!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(sku))throw new Error("كود المنتج مطلوب في Excel لتحديد المنتج ومنع تكراره. استخدم تصدير المنتجات لمعرفة الأكواد التلقائية.");if(seen.has(sku))throw new Error("كود مكرر في الملف. صف واحد لكل منتج.");seen.add(sku);
 const existing={data:productMap.get(sku)??null};if(existing.data?.archived_at)throw new Error("المنتج مؤرشف.");
 const name=z.string().min(1).max(200).parse(v[1]);const category={data:categoryMap.get(v[2]??"")};if(!category.data)throw new Error("القسم غير موجود. أضفه أولًا بنفس الاسم.");if(!["نعم","لا"].includes(v[4]??""))throw new Error("خانة نشط تقبل نعم أو لا.");
 const unitName=z.string().min(1).max(80).parse(v[5]);if(["قطعة","كيس","كانز","زجاجة"].includes(unitName))throw new Error("اختار وحدة جملة كاملة.");const pieces=z.coerce.number().int().min(2).max(1000000).parse(v[6]);const minimum=z.coerce.number().int().min(1).max(100000).parse(v[8]);const price=parseEgpInput(v[7]??"");const oldUnit={data:existing.data?.units.find(u=>u.name===unitName)??null};
 if(oldUnit.data&&oldUnit.data.pieces_per_unit!==pieces)throw new Error("لا تغيّر محتوى وحدة موجودة من الاستيراد؛ راجعه من صفحة المنتج.");rows.push({sku,id:existing.data?.id??null,revision:existing.data?.revision??0,name,category_id:category.data.id,description:z.string().max(4000).parse(v[3]??""),active:v[4]==="نعم",unit_name:unitName,unit_id:oldUnit.data?.id??null,unit_revision:oldUnit.data?.revision??0,pieces,price,minimum});
 }catch(error){errors.push(`صف ${row}: ${error instanceof z.ZodError?"قيم ناقصة أو أعداد خارج الحدود.":error instanceof Error?error.message:"بيانات غير صالحة."}`);}}
 if(errors.length)return {error:"لم يُحفظ أي تغيير. صحح الصفوف التالية وأعد رفع الملف.",errors};const result=await client.rpc("preview_import",{p_kind:kind,p_rows:rows});if(result.error)return {error:"تعذّر حفظ معاينة الاستيراد."};return {batch:String(result.data),rows};
 }catch(error){return {error:error instanceof Error?error.message:"تعذّر قراءة الملف."};}
}
export async function applyImport(_state:ImportState,form:FormData):Promise<ImportState>{const {client}=await requireStaff();const batch=z.uuid().safeParse(form.get("batch"));if(!batch.success||form.get("confirmed")!=="on")return {error:"أكد اعتماد المعاينة."};const result=await client.rpc("apply_import",{p_batch:batch.data});if(result.error)return {error:"لم تُطبّق أي صفوف. قد تكون البيانات تغيرت بعد المعاينة  ارفع الملف مرة أخرى لمعاينة حديثة."};revalidatePath("/admin","layout");revalidatePath("/");return {success:"تم اعتماد الملف بالكامل وتسجيل الدفعة"};}
