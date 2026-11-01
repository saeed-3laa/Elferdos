import "server-only";
import ExcelJS from "exceljs";
import {inflateRawSync} from "node:zlib";
export const productHeaders=["كود المنتج","اسم المنتج","القسم","الوصف","نشط (نعم/لا)","وحدة الجملة","عدد القطع","السعر بالجنيه","أقل كمية"];
export function validateWorkbookArchive(buffer:Buffer){
 if(buffer.length<22||buffer.length>5*1024*1024)throw new Error("حجم الملف غير صالح؛ الحد ٥ ميجابايت.");
 const end=buffer.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));if(end<0||end<buffer.length-65557||end+22>buffer.length)throw new Error("الملف ليس XLSX صالحًا.");
 const count=buffer.readUInt16LE(end+10),size=buffer.readUInt32LE(end+12),start=buffer.readUInt32LE(end+16);
 if(buffer.readUInt16LE(end+4)||buffer.readUInt16LE(end+6)||count<1||count>200||start+size>end)throw new Error("أرشيف Excel غير مدعوم.");
 let offset=start,total=0,actualTotal=0;const names=new Set<string>();const spans:{start:number;end:number}[]=[];for(let i=0;i<count;i++){
 if(offset+46>buffer.length||buffer.readUInt32LE(offset)!==0x02014b50)throw new Error("أرشيف Excel تالف.");
 const expanded=buffer.readUInt32LE(offset+24),nameLength=buffer.readUInt16LE(offset+28);const flags=buffer.readUInt16LE(offset+8);const method=buffer.readUInt16LE(offset+10);
 if(expanded===0xffffffff||(flags&1)||![0,8].includes(method))throw new Error("أرشيف مشفر أو غير مدعوم.");total+=expanded;if(total>10*1024*1024)throw new Error("محتوى Excel بعد الفك أكبر من الحد المسموح.");
 const name=buffer.toString("utf8",offset+46,offset+46+nameLength);if(/vbaProject\.bin$/i.test(name)||/^xl\/externalLinks\//i.test(name))throw new Error("ملفات الماكرو والروابط الخارجية غير مدعومة.");
 if(!name||names.has(name)||name.startsWith('/')||name.includes('\\')||name.includes('\0')||name.split('/').includes('..')||/^[a-z]:/i.test(name))throw new Error("مسار ملف داخل Excel غير صالح.");names.add(name);
 const compressed=buffer.readUInt32LE(offset+20),local=buffer.readUInt32LE(offset+42);
 if(local+30>start||buffer.readUInt32LE(local)!==0x04034b50||buffer.readUInt16LE(local+8)!==method||buffer.readUInt16LE(local+6)!==flags)throw new Error("بيانات أرشيف Excel غير متطابقة.");
 const localNameLength=buffer.readUInt16LE(local+26),payload=local+30+localNameLength+buffer.readUInt16LE(local+28),payloadEnd=payload+compressed;
 if(payloadEnd>start||buffer.toString('utf8',local+30,local+30+localNameLength)!==name||spans.some(span=>local<span.end&&payloadEnd>span.start))throw new Error("حدود ملفات Excel غير صالحة.");spans.push({start:local,end:payloadEnd});
 const input=buffer.subarray(payload,payloadEnd);let actual:number;
 try{actual=method===0?input.length:inflateRawSync(input,{maxOutputLength:10*1024*1024-actualTotal+1}).length;}catch{throw new Error("تعذّر فك Excel ضمن حدود الحجم الآمنة.");}
 actualTotal+=actual;if(actualTotal>10*1024*1024||actual!==expanded)throw new Error("الحجم الفعلي لمحتوى Excel غير مطابق أو أكبر من الحد المسموح.");
 offset+=46+nameLength+buffer.readUInt16LE(offset+30)+buffer.readUInt16LE(offset+32);if(offset>start+size)throw new Error("أرشيف Excel تالف.");
 }
 if(offset!==start+size)throw new Error("فهرس أرشيف Excel غير صالح.");
}
export async function readImportWorkbook(buffer:Buffer){
 validateWorkbookArchive(buffer);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);const sheet=workbook.worksheets[0];if(!sheet||sheet.rowCount>501||sheet.columnCount>20)throw new Error("الملف يقبل حتى ٥٠٠ صف بيانات و٢٠ عمودًا.");
 const headers=productHeaders;
 for(const [i,header]of headers.entries())if(String(sheet.getRow(1).getCell(i+1).value??"").trim()!==header)throw new Error("استخدم القالب العربي المعتمد بنفس ترتيب الأعمدة.");
 const rows:{row:number;values:string[]}[]=[];for(let row=2;row<=sheet.rowCount;row++){
 const values:string[]=[];for(let col=1;col<=headers.length;col++){const value=sheet.getRow(row).getCell(col).value;if(value!==null&&typeof value!=="string"&&typeof value!=="number"&&typeof value!=="boolean")throw new Error(`صف ${row}: الصيغ والروابط والخلايا المركبة غير مدعومة.`);values.push(String(value??"").trim());}
 if(values.some(Boolean))rows.push({row,values});
 }if(!rows.length)throw new Error("الملف لا يحتوي بيانات للاستيراد.");return rows;
}
export type ExportSheet={name:string;headers:string[];rows:(string|number|null)[][]};
export async function makeWorkbook(headers:string[],rows:(string|number|null)[][],notes:string[]=[],additional:ExportSheet[]=[]){
 const workbook=new ExcelJS.Workbook();workbook.creator="مخزن الفردوس";const sheet=workbook.addWorksheet("البيانات",{views:[{rightToLeft:true,state:"frozen",ySplit:1}]});sheet.addRow(headers);for(const row of rows)sheet.addRow(row);
 sheet.columns.forEach(column=>{column.width=24;});sheet.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};sheet.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF18313C"}};sheet.getRow(1).height=30;sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,rows.length+1),column:headers.length}};
 sheet.eachRow(row=>row.alignment={vertical:"middle",wrapText:true});const guide=workbook.addWorksheet("التعليمات",{views:[{rightToLeft:true}]});guide.getColumn(1).width=100;notes.forEach(note=>guide.addRow([note]));
 for(const extra of additional){const tab=workbook.addWorksheet(extra.name,{views:[{rightToLeft:true,state:"frozen",ySplit:1}]});tab.addRow(extra.headers);tab.addRows(extra.rows);tab.columns.forEach(col=>col.width=26);tab.getRow(1).font={bold:true};tab.eachRow(row=>row.alignment={vertical:"middle",wrapText:true});}
 return Buffer.from(await workbook.xlsx.writeBuffer());
}
