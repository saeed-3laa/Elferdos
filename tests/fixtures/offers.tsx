import { createRoot } from "react-dom/client";
import { CartProvider } from "@/components/cart-provider";
import { ProductCard } from "@/components/product-card";
import { CatalogView } from "@/components/catalog-view";
import { PricingForm } from "@/components/pricing-form";
const product = {
 unit_id:"30000000-0000-4000-8000-000000000001", product_id:"20000000-0000-4000-8000-000000000001",
 name:"منتج عرض تجريبي", sku:"OFFER-DEMO", category_name:"مشروبات", unit_name:"كرتونة", pieces_per_unit:24,
 minimum_quantity:1, price_piastres:10000, base_price_piastres:12000, price_label:"عرض تجريبي", available:true,
 image_path:null, image_width:null, image_height:null, description:"",
};
const surface = new URL(location.href).searchParams.get("surface");
createRoot(document.getElementById("fixture-root")!).render(<CartProvider><main id="main" className="container account-page"><h1>{surface === "pricing" ? "عرض جديد" : "المتجر — عروض تجريبية"}</h1>{surface === "pricing" ? <section className="form-panel"><PricingForm/></section> : <CatalogView featured={<ProductCard item={product}/>}><ProductCard item={{...product,unit_id:"30000000-0000-4000-8000-000000000002",price_piastres:12000,available:false}}/></CatalogView>}</main></CartProvider>);
