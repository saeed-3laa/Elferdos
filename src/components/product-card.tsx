import { formatEgp } from "@/domain/money";
import type { CatalogItem } from "@/server/repositories/catalog";
import Image from "next/image";
import { productImageUrl } from "@/domain/product-images";
import {AddToCart} from "@/components/add-to-cart";
import {Icon} from "@/components/icon";

export function ProductCard({ item }: { item: CatalogItem }) {
  const number = new Intl.NumberFormat("ar-EG");
  const imageUrl = productImageUrl(item.image_path);
  return <article className={`product-card ${item.price_piastres<item.base_price_piastres?"product-on-offer":""} ${item.available?"":"product-unavailable"}`}>
    <div className="product-visual">{imageUrl && item.image_width && item.image_height ? <Image className="catalog-product-image" src={imageUrl} alt={item.name} width={item.image_width} height={item.image_height} unoptimized />:<div className="product-placeholder"><Icon name="box"/><span>{item.unit_name}</span></div>}{item.price_piastres<item.base_price_piastres&&<span className="offer-badge"><Icon name="tag"/>عرض</span>}<span className="unit-badge">{item.unit_name}</span></div>
    <div className="product-content">
    <div className="product-summary">
    <div className="product-meta"><span>{item.category_name}</span>
      <span className={item.available ? "available" : "muted"}>{item.available ? "متوفر" : "غير متوفر"}</span>
    </div>
    <h3>{item.name}</h3>
    <p className="sku">كود المنتج: <bdi>{item.sku}</bdi></p>
    <p className="unit-description">{item.unit_name} · {number.format(item.pieces_per_unit)} قطعة داخلية<span>أقل كمية: {number.format(item.minimum_quantity)} {item.unit_name}</span></p>
    <div className="product-price"><strong className="price">{formatEgp(item.price_piastres)}</strong><span>للـ{item.unit_name}</span></div>
    {item.price_piastres<item.base_price_piastres&&<p className="previous-price"><del>{formatEgp(item.base_price_piastres)}</del> · {item.price_label}</p>}
    <small>سعر عام عند أقل كمية / {item.unit_name}. السعر الخاص والشرائح يُراجعان في السلة.</small>
    {item.description&&<details><summary>وصف المنتج</summary><p>{item.description}</p></details>}
    </div>
    <AddToCart id={item.unit_id} name={item.name} unit={item.unit_name} minimum={item.minimum_quantity} available={item.available}/>
    </div>
  </article>;
}
