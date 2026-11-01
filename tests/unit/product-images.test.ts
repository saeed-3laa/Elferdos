import {describe,it,expect} from "vitest";
import sharp from "sharp";
import {encodeProductImage} from "@/server/storage/encode-image";
import {MAX_IMAGE_BYTES,productImageUrl} from "@/domain/product-images";

describe("product image normalization",()=>{
  it("decodes real pixels, resizes and strips original metadata",async()=>{
    const input = await sharp({create:{width:2000,height:1000,channels:3,background:"#426b50"}}).withMetadata().jpeg().toBuffer();
    const result = await encodeProductImage(input);
    const metadata = await sharp(result.data).metadata();
    expect([result.width,result.height]).toEqual([1280,640]);
    expect(metadata.format).toBe("webp");
    expect(metadata.exif).toBeUndefined();
  });
  it.each([Buffer.from("not an image"),Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"></svg>'),Buffer.alloc(MAX_IMAGE_BYTES+1)])("rejects unsafe or excessive input",async(input)=>{
    await expect(encodeProductImage(input)).rejects.toThrow();
  });
  it("rejects images beyond the pixel limit before full decoding",async()=>{
    const large = await sharp({create:{width:5100,height:5000,channels:3,background:"white"}}).png().toBuffer();
    await expect(encodeProductImage(large)).rejects.toThrow();
  });
  it("never constructs URLs from external or traversing paths",()=>{
    expect(productImageUrl("https://example.com/a.png")).toBeNull();
    expect(productImageUrl("../x.webp")).toBeNull();
  });
});
