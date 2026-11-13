import { createRoot } from "react-dom/client";
import { CartProvider, useCart } from "@/components/cart-provider";
import { Reorder } from "@/components/order-forms";
import { AdminNavigation } from "@/components/admin-navigation";
import { AccountShell } from "@/components/account-shell";
import { AuthForm, AddressForm } from "@/components/account-forms";
import { ProductForm } from "@/components/admin-forms";
import { ProductCard } from "@/components/product-card";
import { StoreHeader } from "@/components/store-header";
import { MobileStoreNavigation } from "@/components/store-navigation";
import { Brand } from "@/components/brand";
import { SearchInput } from "@/components/search-input";
import { adminItems, reorderItems } from "./frontend-data";

const category = { id: "50000000-0000-4000-8000-000000000001", name: "قسم تجريبي", active: true, revision: 0 };
const product = {
  unit_id: reorderItems[0]!.unit_id, product_id: "20000000-0000-4000-8000-000000000001",
  name: "منتج تجريبي للجملة", sku: "FRONTEND-001", category_name: category.name, unit_name: "كرتونة",
  pieces_per_unit: 24, minimum_quantity: 1, price_piastres: 10000, base_price_piastres: 12000,
  price_label: "عرض تجريبي", available: true, image_path: null, image_width: null, image_height: null,
  description: "وصف تجريبي لاختبار النص العربي واتجاه الواجهة.",
};
function ReorderFixture() {
  const { items, ready } = useCart();
  return <main id="main" className="container account-page"><h1>إعادة طلب تجريبي</h1>
    <Reorder items={reorderItems} /><output hidden data-testid="cart-state">{ready ? JSON.stringify(items) : "loading"}</output>
  </main>;
}
function StateSamples() {
  return <><p className="form-error" role="alert">تعذّر الحفظ. راجع البيانات وحاول مرة أخرى.</p>
    <p className="form-success" role="status">تم حفظ البيانات.</p>
    <p className="field-hint">بيانات تجريبية لقياس النص المساعد.</p>
    <p><span className="order-status status-new">مؤكد</span> <span className="order-status status-delivered">تم التسليم</span> <span className="order-status status-cancelled">ملغي</span></p></>;
}
function AdminFixture() {
  return <div className="admin-app"><aside className="admin-sidebar"><div className="sidebar-brand"><Brand admin /></div>
    <AdminNavigation items={adminItems} /><div className="sidebar-note"><p>مساحة إدارة الفردوس<small>وصول حسب الصلاحيات</small></p></div></aside>
    <div className="admin-workspace"><header className="admin-topbar"><span className="desktop-admin-label">لوحة الإدارة</span><span className="mobile-admin-brand"><Brand admin /></span></header>
      <main id="main" className="account-page admin-page"><h1>إدارة المخزن — بيانات تجريبية</h1>
        <section className="admin-welcome"><div><p>شغلك أوضح</p><h2>ابدأ من هنا</h2><span>تابع طلبات محلك.</span></div></section>
        <form className="admin-filters"><label>البحث<input placeholder="اسم المنتج" defaultValue="منتج" /></label><label>الحالة<select><option>كل الحالات</option></select></label><button type="button" className="button">تطبيق</button></form>
        <section className="form-panel"><ProductForm categories={[category]} /></section><StateSamples />
        <div className="table-scroll"><table className="admin-table"><thead><tr><th>المنتج</th><th>الحالة</th></tr></thead><tbody><tr><td>منتج تجريبي</td><td>متوفر</td></tr></tbody></table></div>
      </main><footer className="admin-footer">الفردوس — الإسكندرية</footer></div></div>;
}
function StoreFixture() {
  return <div className="storefront"><StoreHeader home /><main id="main" className="container store-main">
    <section className="intro"><div><p className="eyebrow">احتياجات محلك</p><h1>جملة على قد شغلك.</h1><p className="intro-copy">طلبية واضحة وأسعار أمامك.</p><a className="button" href="#products">تصفح المنتجات</a></div></section>
    <aside className="offers-banner"><div><h2>العروض</h2><p>سعر واضح قبل وبعد الخصم.</p></div></aside>
    <div className="category-chips"><a className="is-selected" href="#products">كل الأقسام</a><a href="#products">قسم تجريبي</a></div>
    <form className="search-form"><label htmlFor="fixture-search">ابحث عن منتج</label><div><SearchInput id="fixture-search" scope="catalog" label="ابحث عن منتج" placeholder="اسم المنتج أو الكود" /><button className="button" type="button">بحث</button></div>
      <div className="catalog-filters"><label>القسم<select><option>كل الأقسام</option></select></label><label className="checkbox-label"><input type="checkbox" />المتاح فقط</label></div></form>
    <div id="products" className="catalog-results" data-view="grid"><div className="product-grid"><ProductCard item={product} /><ProductCard item={{ ...product, unit_id: "30000000-0000-4000-8000-000000000004", available: false }} /></div></div>
    <StateSamples /><p className="catalog-disclaimer">الأسعار والتوافر يُراجعان قبل إرسال الطلب.</p>
  </main><footer className="site-footer"><div className="container footer-inner"><Brand /><p>شريك محلك في الجملة.<span>الإسكندرية، مصر</span></p></div></footer><MobileStoreNavigation /></div>;
}
const surface = new URL(location.href).searchParams.get("surface");
createRoot(document.getElementById("fixture-root")!).render(<CartProvider>{surface === "admin" ? <AdminFixture /> : surface === "account" ?
  <AccountShell title="حساب تجريبي" intro="راجع بيانات محلك."><section className="form-panel auth-panel"><AuthForm mode="register" /><StateSamples /><AddressForm zones={[category]} /></section></AccountShell>
  : surface === "reorder" ? <ReorderFixture /> : <StoreFixture />}</CartProvider>);
