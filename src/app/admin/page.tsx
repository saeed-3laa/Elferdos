import Link from "next/link";
import { requireStaff } from "@/server/auth/staff";
import { StatusPanel } from "@/components/status-panel";
import {Icon,type IconName} from "@/components/icon";
import {orderStatusLabel} from "@/domain/orders";
import {formatEgp} from "@/domain/money";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { access,client,profile } = await requireStaff();
  const { notice } = await searchParams;
  const roles = { OWNER: "مالك المخزن", MANAGER: "مدير", ORDER_STAFF: "موظف طلبات", VIEWER: "عرض فقط" };
  const recent=access.permissions.includes("orders.read")?await client.from("orders").select("id,number,status,total,customer_snapshot").order("number",{ascending:false}).limit(5):null;
  const cards:{permission:string;href:string;title:string;copy:string;action:string;icon:IconName}[]=[
    {permission:"orders.read",href:"/admin/orders",title:"الطلبات والتحصيل",copy:"من أول طلب جديد لحد التسليم والتحصيل.",action:"متابعة الطلبات",icon:"cart"},
    {permission:"catalog.read",href:"/admin/products",title:"المنتجات ووحدات الجملة",copy:"المنتجات والأسعار والصور والتوافر، في مكان واحد.",action:"فتح المنتجات",icon:"box"},
    {permission:"customers.read",href:"/admin/customers",title:"العملاء",copy:"بيانات محلاتك وحساباتهم وصلاحيات فريقك.",action:"إدارة العملاء",icon:"users"},
    {permission:"catalog.write",href:"/admin/pricing",title:"العروض والأسعار",copy:"عروض بمدة محددة وأسعار خاصة لعملائك.",action:"إدارة العروض",icon:"tag"},
    {permission:"settings.write",href:"/admin/zones",title:"التوصيل داخل الإسكندرية",copy:"المناطق المتاحة ومواعيد التوصيل. التوصيل مجاني.",action:"إدارة المناطق",icon:"truck"},
    {permission:"reports.read",href:"/admin/reports",title:"التقارير",copy:"راجع المبيعات والطلبات والمبالغ المحصلة فعليًا.",action:"عرض التقارير",icon:"report"},
  ];
  return <><div className="account-title"><p className="eyebrow">{roles[access.role]}</p><h1>إدارة المخزن</h1><p className="muted">أهلًا {profile.full_name.split(" ")[0]}، كل اللي محتاجه لإدارة شغلك، هنا.</p></div>
    {notice === "forbidden" && <p className="form-error" role="alert">ليست لديك صلاحية لهذا القسم.</p>}
    <section className="admin-welcome"><div><p>شغلك أوضح، ويومك أسهل.</p><h2>ابدأ من هنا</h2><span>تابع الطلبات وحدّث منتجاتك وجهّز طلبية كل عميل.</span></div><Icon name="box"/></section>
    <div className="admin-home-links">{cards.filter(card=>access.permissions.includes(card.permission)).map(card=><section className="form-panel admin-shortcut" key={card.href}><span className="shortcut-icon"><Icon name={card.icon}/></span><h2>{card.title}</h2><p>{card.copy}</p><Link className="text-link" href={card.href}>{card.action}<Icon name="arrow"/></Link></section>)}</div>
    {recent&&<section className="admin-section"><div className="section-heading"><h2>آخر الطلبات</h2><Link className="text-link" href="/admin/orders">كل الطلبات <Icon name="arrow"/></Link></div>{recent.error?<p role="alert" className="form-error">تعذّر تحميل آخر الطلبات. حاول تحديث الصفحة.</p>:recent.data.length?<div className="table-scroll"><table className="admin-table"><thead><tr><th>الطلب</th><th>العميل</th><th>الحالة</th><th>الإجمالي</th></tr></thead><tbody>{recent.data.map(order=><tr key={order.id}><td><Link href={`/admin/orders/${order.id}`}>طلب {order.number}</Link></td><td>{(order.customer_snapshot as {name:string}).name}</td><td><span className={`order-status status-${order.status.toLowerCase()}`}>{orderStatusLabel(order.status)}</span></td><td>{formatEgp(order.total)}</td></tr>)}</tbody></table></div>:<div className="dashboard-empty"><Icon name="box"/><h3>مستنيين أول طلبية</h3><p>الطلبات الجديدة هتظهر هنا بمجرد ما عملاؤك يطلبوا.</p></div>}</section>}
    {!access.permissions.includes("catalog.read") && <StatusPanel title="صلاحيات الحساب"><p>حسابك مخصص لمعالجة الطلبات.</p><Link className="button" href="/admin/orders">فتح الطلبات</Link></StatusPanel>}
    <p className="catalog-disclaimer">التوافر يُحدد يدويًا من بيانات المنتج: متوفر أو غير متوفر.</p>
  </>;
}
