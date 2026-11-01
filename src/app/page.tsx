import Link from "next/link";
import { SearchInput } from "@/components/search-input";
import { StatusPanel } from "@/components/status-panel";
import { ProductCard } from "@/components/product-card";
import {CatalogView} from "@/components/catalog-view";
import { catalogQuerySchema, getCatalog } from "@/server/repositories/catalog";
import {createPublicClient} from "@/server/supabase/public";
import {StoreHeader} from "@/components/store-header";
import {MobileStoreNavigation} from "@/components/store-navigation";
import {Brand} from "@/components/brand";
import {Icon} from "@/components/icon";
import {WholesaleIllustration} from "@/components/wholesale-illustration";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = catalogQuerySchema.parse({ q: params.q ?? "", after: params.after,category:params.category??"",sort:params.sort,available:params.available });
  const [catalog,categories]=await Promise.all([getCatalog(query),createPublicClient()?.from("categories").select("id,name").order("name").limit(500)??Promise.resolve({data:[]})]);
  const offers=catalog.status==="ready"?catalog.items.filter(item=>item.price_piastres<item.base_price_piastres):[];
  const categoryUrl=(id:string)=>`/?${new URLSearchParams({q:query.q,category:id,sort:query.sort,available:query.available?"1":"0"})}#products`;
  return <div className="storefront">
    <StoreHeader home/>
    <main id="main" className="container store-main">
      <section className={`intro ${query.q||query.category||query.after?"intro-compact":""}`} aria-labelledby="intro-title">
        <div className="intro-content"><p className="eyebrow"><span className="live-dot"/>احتياجات محلك، في مكان واحد</p><h1 id="intro-title">جملة على قد <span>شغلك.</span></h1><p className="intro-copy">رفوف مليانة، وطلبية أسهل.<br/>كل اللي محلك محتاجه، من المخزن لحد عندك.</p><div className="hero-actions"><a className="button" href="#products">تصفح المنتجات <Icon name="arrow"/></a><Link className="hero-secondary" href="/account/orders">تابع طلباتك <span aria-hidden="true">↖</span></Link></div><div className="hero-wholesale"><Icon name="box"/><span>كراتين وبالتات كاملة. وحدات واضحة وأسعار قدامك.</span></div></div>
        <div className="hero-art"><span className="hero-art-caption">من مخزننا، لمحلك.</span><WholesaleIllustration/><span className="hero-art-label"><Icon name="check"/>طلبية واضحة، من أول خطوة</span></div>
      </section>
      <div className="benefits-row"><div><span className="benefit-icon"><Icon name="truck"/></span><p><strong>توصيل مجاني داخل الإسكندرية</strong><small>من نفس اليوم وحتى يومين</small></p></div><div><span className="benefit-icon"><Icon name="box"/></span><p><strong>الجملة على أصولها</strong><small>كرتونة أو بالتة، حسب احتياجك</small></p></div><div><span className="benefit-icon"><Icon name="wallet"/></span><p><strong>حسابك بالطريقة اللي تريحك</strong><small>كاش أو إنستا باي</small></p></div></div>
      {offers.length>0&&query.sort==="offers"&&!query.after&&<aside className="offers-banner"><span className="offers-banner-icon"><Icon name="tag"/></span><div><p className="eyebrow">فرصة لتوفير أكتر</p><h2>عروض تستاهل مكان على رفك</h2><p>المنتجات المخفّضة في أول القائمة. السعر قبل وبعد الخصم واضح قدامك.</p></div><a className="button button-secondary" href="#products">شوف العروض <Icon name="arrow"/></a></aside>}
      <section id="products" className="catalog" aria-labelledby="catalog-title">
        <div className="section-heading"><div><p className="eyebrow">اختار. ضيف. وكمّل شغلك.</p><h2 id="catalog-title">المنتجات</h2></div><span className="section-note">البيع بوحدات جملة كاملة <Icon name="box"/></span></div>
        {!!categories.data?.length&&<div className="category-chips" aria-label="تصفية حسب القسم"><Link href={categoryUrl("")} className={!query.category?"is-selected":""}><Icon name="grid"/>كل الأقسام</Link>{categories.data.map(c=><Link key={c.id} href={categoryUrl(c.id)} className={query.category===c.id?"is-selected":""}>{c.name}</Link>)}</div>}
        {catalog.status === "not-configured" ? <StatusPanel title="الكتالوج قيد التجهيز"><p>جارٍ تجهيز المنتجات والأسعار. استقبال الطلبات لم يبدأ بعد.</p><p>ستظهر هنا المنتجات المتاحة بمجرد اكتمال التجهيز.</p></StatusPanel>
          : catalog.status === "unavailable" ? <StatusPanel title="تعذّر تحميل المنتجات حاليًا" error><p>حاول مرة أخرى بعد قليل.</p><Link className="text-link" href="/">إعادة المحاولة</Link></StatusPanel>
          : <>
            <form action="/" method="get" className="search-form"><label htmlFor="product-search">ابحث عن منتج</label><div><SearchInput id="product-search" scope="catalog" label="ابحث عن منتج" maxLength={100} defaultValue={query.q} placeholder="اسم المنتج أو الكود" /><button className="button" type="submit">بحث</button></div><div className="catalog-filters"><label>القسم<select name="category" defaultValue={query.category}><option value="">كل الأقسام</option>{categories.data?.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>الترتيب<select name="sort" defaultValue={query.sort}><option value="offers">العروض أولًا</option><option value="sku">حسب الكود</option><option value="name">حسب الاسم</option></select></label><label className="checkbox-label"><input name="available" value="1" type="checkbox" defaultChecked={query.available}/>المتاح فقط</label></div></form>
            {catalog.items.length === 0 ? <StatusPanel title={query.q ? "لا توجد منتجات مطابقة" : "لا توجد منتجات متاحة حاليًا"}><p>{query.q ? "جرّب اسمًا آخر أو كود المنتج الكامل." : "راجع الكتالوج لاحقًا لمعرفة المنتجات المتاحة."}</p>{query.q && <Link className="text-link" href="/">عرض جميع المنتجات</Link>}</StatusPanel>
              : <CatalogView>{catalog.items.map((item) => <ProductCard key={item.unit_id} item={item} />)}</CatalogView>}
            <div className="pagination">{query.after && <Link className="text-link" href={`/?${new URLSearchParams({ q: query.q,category:query.category,sort:query.sort,available:query.available?"1":"0" })}`}>العودة للبداية</Link>}{catalog.nextCursor && <Link className="button" href={`/?${new URLSearchParams({ q: query.q, after: catalog.nextCursor,category:query.category,sort:query.sort,available:query.available?"1":"0" })}`}>المنتجات التالية</Link>}</div>
            <p className="catalog-disclaimer">التوافر تحدده إدارة المخزن. الأسعار وكميات الطلب تُراجع قبل إرساله.</p>
          </>}
      </section>
      <section className="delivery-card delivery-section" id="delivery" aria-labelledby="delivery-title"><div><p className="eyebrow">طلبك معانا خطوة بخطوة</p><h2 id="delivery-title">من المخزن إلى محلك</h2><p>جهّز طلبية محلك في دقائق، وراجع السعر والتوصيل قبل ما تأكد الطلب.</p></div><dl><div><dt><Icon name="location"/>نطاق التوصيل</dt><dd>كل المناطق المتاحة في الإسكندرية — مجانًا</dd></div><div><dt><Icon name="truck"/>المدة المتوقعة</dt><dd>نفس اليوم وحتى يومين</dd></div><div><dt><Icon name="wallet"/>طرق الدفع</dt><dd>كاش أو إنستا باي</dd></div></dl></section>
      <section className="wholesale-note"><Icon name="box"/><div><h2>وحدة بيع واضحة، وطلب محسوب.</h2><p>الكمية تُحسب بعدد الكراتين أو البالتات. عدد القطع داخل العبوة للمعلومة، والبيع لا يشمل القطع المفردة.</p></div></section>
    </main>
    <footer className="site-footer"><div className="container footer-inner"><Brand/><p>شريك محلك في الجملة.<br/><span>الإسكندرية، مصر</span></p><Link href="/account">حساب المحل <Icon name="arrow"/></Link></div></footer>
    <MobileStoreNavigation/>
  </div>;
}
