import {deflateRawSync} from "node:zlib";
import {describe,it,expect} from "vitest";
import ExcelJS from "exceljs";
import {makeWorkbook,readImportWorkbook,productHeaders,validateWorkbookArchive} from "@/server/excel/workbook";
describe("Arabic XLSX",()=>{
 it("exports Arabic headers, real numbers, RTL and text without converting it into formulas",async()=>{
 const buffer=await makeWorkbook(["الاسم","القيمة"],[["=1+1",123.45]],["تعليمات"]);const w=new ExcelJS.Workbook();await w.xlsx.load(buffer as unknown as Parameters<typeof w.xlsx.load>[0]);expect(w.worksheets[0]!.getCell("A1").value).toBe("الاسم");expect(w.worksheets[0]!.getCell("A2").value).toBe("=1+1");expect(w.worksheets[0]!.getCell("B2").value).toBe(123.45);expect(w.worksheets[0]!.views[0]!.rightToLeft).toBe(true);
 });
 it("reads the real product template and preserves decimal prices",async()=>{const buffer=await makeWorkbook(productHeaders,[["ABC","منتج عربي","قسم","وصف","نعم","كرتونة",12,123.45,1]]);const rows=await readImportWorkbook(buffer);expect(rows[0]).toMatchObject({row:2});expect(rows[0]!.values[7]).toBe("123.45");});
 it("rejects mismatched templates",async()=>{await expect(readImportWorkbook(await makeWorkbook(["خطأ"],[["ABC"]]))).rejects.toThrow("القالب");});
 it("rejects formulas rather than trusting cached results",async()=>{const w=new ExcelJS.Workbook();const s=w.addWorksheet("بيانات");s.addRow(productHeaders);s.addRow(["ABC","كرتونة",{formula:"1+1",result:2}]);const buffer=Buffer.from(await w.xlsx.writeBuffer());await expect(readImportWorkbook(buffer)).rejects.toThrow("الصيغ");});
 it("rejects too many rows",async()=>{const buffer=await makeWorkbook(productHeaders,Array.from({length:501},()=>["ABC","كرتونة",1]));await expect(readImportWorkbook(buffer)).rejects.toThrow("٥٠٠");});
 it("rejects invalid and oversized archives before decoding",()=>{expect(()=>validateWorkbookArchive(Buffer.from("not zip"))).toThrow();expect(()=>validateWorkbookArchive(Buffer.alloc(5*1024*1024+1))).toThrow();});
 it("rejects an excessive declared expansion size",async()=>{const buffer=await makeWorkbook(productHeaders,[["ABC","كرتونة",1]]);const end=buffer.lastIndexOf(Buffer.from([0x50,0x4b,5,6]));const central=buffer.readUInt32LE(end+16);buffer.writeUInt32LE(31*1024*1024,central+24);expect(()=>validateWorkbookArchive(buffer)).toThrow("بعد الفك");});
});

it("rejects forged ZIP expansion metadata using actual bounded decompression",()=>{
 // One intentionally malformed archive: the central directory claims one byte,
 // while the compressed stream expands beyond the complete workbook allowance.
 const input=Buffer.alloc(10*1024*1024+20,65);const compressed=deflateRawSync(input);const name=Buffer.from('[Content_Types].xml');
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(8,8);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(1,22);local.writeUInt16LE(name.length,26);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(8,10);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(1,24);central.writeUInt16LE(name.length,28);
 const start=local.length+name.length+compressed.length;const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(start,16);
 expect(()=>validateWorkbookArchive(Buffer.concat([local,name,compressed,central,name,end]))).toThrow(/الحجم|حدود/);
});
