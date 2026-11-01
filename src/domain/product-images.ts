export const PRODUCT_IMAGE_BUCKET = "product-images";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export type ProductImage = { storage_path: string | null; width: number | null; height: number | null; revision: number };

export function productImageUrl(path: string | null): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !path || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(path)) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/${path}`;
}
