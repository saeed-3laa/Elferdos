import "server-only";
import sharp from "sharp";
import { MAX_IMAGE_BYTES } from "@/domain/product-images";

// Decode actual pixels rather than trusting the filename or browser MIME type.
export async function encodeProductImage(input: Buffer) {
  if (!input.length || input.length > MAX_IMAGE_BYTES) throw new Error("IMAGE_SIZE");
  const jpeg = input.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff]));
  const png = input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp = input.toString("ascii",0,4)==="RIFF" && input.toString("ascii",8,12)==="WEBP";
  if (!jpeg && !png && !webp) throw new Error("IMAGE_FORMAT");
  const image = sharp(input, { limitInputPixels: 25_000_000, failOn: "warning" });
  const metadata = await image.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1)>1) throw new Error("IMAGE_FORMAT");
  const { data, info } = await image.rotate().resize(1280,1280,{fit:"inside",withoutEnlargement:true})
    .webp({quality:82}).toBuffer({resolveWithObject:true});
  if (data.length>2*1024*1024) throw new Error("IMAGE_SIZE");
  return { data, width:info.width, height:info.height };
}
