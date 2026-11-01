import { describe, it, expect } from "vitest";
import { parseEgpInput, egpInput, productSchema } from "@/domain/admin";

describe("admin decimal money",()=>{
  it.each([["2000",200000],["2000.01",200001],["٠٫١٠",10],["0.1",10],["00012.34",1234],["1000000.00",100000000]])("converts %s to exact piastres",(raw,expected)=>expect(parseEgpInput(String(raw))).toBe(expected));
  it.each(["-1","1.001","1e3","2,000","٢٬٠٠٠","","Infinity","1000000.01"])("rejects ambiguous or invalid amount %s",(raw)=>expect(()=>parseEgpInput(raw)).toThrow());
  it("roundtrips prices without floating point multiplication",()=>expect(parseEgpInput(egpInput(12345))).toBe(12345));
});
it("normalizes a unique product code and ignores protected fields",()=>{
  const data = productSchema.parse({id:"",revision:"0",sku:"test-01",name:"منتج",category_id:"10000000-0000-4000-8000-000000000001",description:"",active:false,archived_at:"forged"});
  expect(data.sku).toBe("TEST-01"); expect(data).not.toHaveProperty("archived_at");
});
it.each(["", "   ", undefined])("accepts an optional product code %s", (sku) => {
  expect(productSchema.parse({id:"",revision:"0",sku,name:"منتج",category_id:"10000000-0000-4000-8000-000000000001",description:"",active:false}).sku).toBe("");
});
