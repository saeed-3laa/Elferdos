"use client";

import Image from "next/image";
import { useActionState } from "react";
import { uploadProductImage,removeProductImage } from "@/app/admin/image-actions";
import { productImageUrl,type ProductImage } from "@/domain/product-images";
import type { FormState } from "@/domain/accounts";

function Message({state}:{state:FormState}) { return <>{state.error && <p role="alert" className="form-error">{state.error}</p>}{state.success && <p role="status" className="form-success">{state.success}</p>}</>; }

export function ProductImageEditor({productId,name,image,editable}:{productId:string;name:string;image:ProductImage|null;editable:boolean}) {
  const [uploadState,upload,pending] = useActionState(uploadProductImage,{});
  const [removeState,remove,removing] = useActionState(removeProductImage,{});
  const url = productImageUrl(image?.storage_path ?? null);
  return <section className="form-panel product-image-panel"><h2>صورة المنتج</h2>
    {url ? <Image className="product-image-preview" src={url} alt={name} width={image!.width!} height={image!.height!} unoptimized /> : <p className="muted">لم تُضف صورة لهذا المنتج بعد.</p>}
    {!url && <Message state={removeState} />}
    {editable && <><form action={upload} className="account-form image-upload-form"><Message state={uploadState} />
      <input type="hidden" name="product_id" value={productId} /><input type="hidden" name="revision" value={image?.revision ?? 0} />
      <label>اختيار صورة المنتج<input name="image" type="file" accept="image/jpeg,image/png,image/webp" required /></label>
      <p className="field-hint">صورة JPEG أو PNG أو WebP ثابتة، حتى ٥ ميجابايت. تُصغّر وتُجهّز تلقائيًا للعرض.</p>
      <button className="button" disabled={pending || removing}>{pending ? "جارٍ رفع الصورة…" : url ? "استبدال الصورة" : "رفع الصورة"}</button>
    </form>{url && <form action={remove} className="account-form image-remove-form"><Message state={removeState} />
      <input type="hidden" name="product_id" value={productId} /><input type="hidden" name="revision" value={image?.revision ?? 0} />
      <label className="checkbox-label"><input type="checkbox" name="confirmed" required />تأكيد حذف صورة المنتج</label>
      <button className="button button-danger" disabled={pending || removing}>{removing ? "جارٍ الحذف…" : "حذف الصورة"}</button>
    </form>}</>}
  </section>;
}
