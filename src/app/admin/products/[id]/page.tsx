import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/server/auth/staff";
import { ArchiveForm, ProductForm, UnitForm } from "@/components/admin-forms";
import { StatusPanel } from "@/components/status-panel";
import { formatEgp } from "@/domain/money";
import type { AdminProduct, AdminUnit } from "@/domain/admin";
import { ProductImageEditor } from "@/components/product-image-editor";
import type { ProductImage } from "@/domain/product-images";

export default async function ProductDetails({ params }: { params: Promise<{ id:string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { client, access } = await requireStaff("catalog.read");
  const canWrite = access.permissions.includes("catalog.write");
  const [productResult,unitsResult,categoriesResult,imageResult] = await Promise.all([
    client.from("products").select("id,sku,name,category_id,description,active,available,archived_at,revision").eq("id",id).maybeSingle(),
    client.from("product_units").select("id,product_id,name,pieces_per_unit,price_piastres,minimum_quantity,active,revision").eq("product_id",id).order("id").limit(20),
    client.from("categories").select("id,name,active,revision").order("name").limit(500),
    client.from("product_images").select("storage_path,width,height,revision").eq("product_id",id).maybeSingle(),
  ]);
  if (productResult.error || unitsResult.error || categoriesResult.error || imageResult.error) throw new Error("PRODUCT_UNAVAILABLE");
  if (!productResult.data) notFound();
  const product = productResult.data as AdminProduct;
  const units = unitsResult.data as AdminUnit[];
  return <><div className="account-title"><Link className="text-link" href="/admin/products">العودة للمنتجات</Link><h1>{product.name}</h1><p className="muted">الكود: <bdi>{product.sku}</bdi> · {product.archived_at ? "مؤرشف" : product.active ? "نشط" : "غير نشط"}</p></div>
    <p>التوافر اليدوي: <strong>{product.available ? "متوفر" : "غير متوفر"}</strong></p><p className="field-hint">قبول الطلب يتطلب أيضًا منتجًا غير مؤرشف وقسمًا ووحدة بيع مفعّلين.</p><div className="admin-detail-grid"><section className="form-panel"><h2>بيانات المنتج</h2>{canWrite && !product.archived_at ? <ProductForm product={product} categories={categoriesResult.data} /> : <><p>{product.description || "لا يوجد وصف للمنتج."}</p><p>القسم: {categoriesResult.data.find((c)=>c.id===product.category_id)?.name ?? "قسم غير ظاهر"}</p></>}{canWrite && <div className="archive-section"><ArchiveForm product={product} /></div>}</section>
    </div>
    <ProductImageEditor productId={id} name={product.name} image={imageResult.data as ProductImage|null} editable={canWrite && !product.archived_at} />
    <section className="admin-section"><h2>وحدات الجملة والأسعار</h2><div className="reference-grid">{units.map((unit)=><section className="form-panel" key={unit.id}><h3>{unit.name}</h3>{canWrite && !product.archived_at ? <UnitForm productId={id} unit={unit} /> : <><p>{unit.pieces_per_unit} قطعة داخل الوحدة · أقل كمية {unit.minimum_quantity}</p><p>{formatEgp(unit.price_piastres)} · {unit.active ? "مفعّلة" : "غير مفعّلة"}</p></>}</section>)}</div>
      {canWrite && !product.archived_at && <section className="form-panel new-unit"><h3>وحدة جملة جديدة</h3><UnitForm productId={id} /></section>}
      {!units.length && !canWrite && <StatusPanel title="لا توجد وحدات جملة"><p>لم تضف الإدارة وحدات لهذا المنتج بعد.</p></StatusPanel>}
    </section>
  </>;
}
