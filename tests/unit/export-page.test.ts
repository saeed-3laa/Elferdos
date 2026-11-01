import {describe,it,expect,vi} from "vitest";
import {readExportPage} from "@/server/excel/export-page";
describe("export page transient failures",()=>{
 it("recovers a temporary page read once before any rows are committed",async()=>{const read=vi.fn().mockResolvedValueOnce({data:null,error:{code:""}}).mockResolvedValue({data:["row"],error:null});expect(await readExportPage(read)).toEqual({data:["row"],error:null});expect(read).toHaveBeenCalledTimes(2);});
 it("bounds retries when a read keeps timing out",async()=>{const read=vi.fn().mockResolvedValue({data:null,error:{code:"57014"}});expect((await readExportPage(read)).error?.code).toBe("57014");expect(read).toHaveBeenCalledTimes(3);});
 it("never retries authorization failures",async()=>{const read=vi.fn().mockResolvedValue({data:null,error:{code:"42501"}});await readExportPage(read);expect(read).toHaveBeenCalledTimes(1);});
 it("stops before issuing reads after the download was cancelled",async()=>{const controller=new AbortController();controller.abort();const read=vi.fn();await expect(readExportPage(read,controller.signal)).rejects.toThrow();expect(read).not.toHaveBeenCalled();});
});
