import Link from "next/link";
import { requireStaff } from "@/server/auth/staff";
import { logoutAction } from "@/app/auth-actions";
import {Brand} from "@/components/brand";
import {AdminNavigation,type AdminNavItem} from "@/components/admin-navigation";
import {Icon} from "@/components/icon";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { access, profile } = await requireStaff();
  const can = (permission: string) => access.permissions.includes(permission);
  const items:AdminNavItem[]=[{href:"/admin",label:"الرئيسية",icon:"grid",group:"مساحة العمل"}];
  if(can("orders.read"))items.push({href:"/admin/orders",label:"الطلبات والتحصيل",icon:"cart",group:"مساحة العمل"});
  if(can("catalog.read"))items.push({href:"/admin/products",label:"المنتجات",icon:"box",group:"مساحة العمل"});
  if(can("orders.read"))items.push({href:"/admin/returns",label:"المرتجعات",icon:"box",group:"مساحة العمل"});
  if(can("customers.read"))items.push({href:"/admin/customers",label:"العملاء",icon:"users",group:"مساحة العمل"});
  if(can("catalog.write"))items.push({href:"/admin/categories",label:"الأقسام",icon:"grid",group:"إدارة المتجر"},{href:"/admin/pricing",label:"العروض والأسعار",icon:"tag",group:"إدارة المتجر"});
  if(can("settings.write"))items.push({href:"/admin/zones",label:"مناطق التوصيل",icon:"truck",group:"إدارة المتجر"});
  if(can("reports.read"))items.push({href:"/admin/reports",label:"التقارير",icon:"report",group:"البيانات والإعدادات"});
  if(can("catalog.read"))items.push({href:"/admin/excel",label:"Excel",icon:"excel",group:"البيانات والإعدادات"});
  if(can("staff.manage"))items.push({href:"/admin/staff",label:"فريق الإدارة",icon:"shield",group:"البيانات والإعدادات"});
  if(can("settings.write"))items.push({href:"/admin/settings",label:"الإعدادات",icon:"settings",group:"البيانات والإعدادات"});
  items.push({href:"/admin/profile",label:"حسابي وكلمة المرور",icon:"user",group:"البيانات والإعدادات"});
  if(can("audit.read"))items.push({href:"/admin/audit",label:"سجل المراجعة",icon:"history",group:"البيانات والإعدادات"});
  return <div className="admin-app">
    <aside className="admin-sidebar"><div className="sidebar-brand"><Brand admin/></div><AdminNavigation items={items}/><div className="sidebar-note"><Icon name="shield"/><p>مساحة إدارة الفردوس<small>وصول حسب صلاحيات حسابك</small></p></div></aside>
    <div className="admin-workspace"><header className="admin-topbar"><div className="admin-topbar-title"><span className="desktop-admin-label"><Icon name="grid"/>لوحة الإدارة</span><span className="mobile-admin-brand"><Brand admin/></span></div><div className="admin-user"><Link className="store-preview-link" href="/"><Icon name="arrow"/>عرض المتجر</Link><span className="user-avatar"><Icon name="user"/></span><span className="admin-user-name">{profile.full_name}<small>حساب إدارة المخزن</small></span><form action={logoutAction}><button className="text-button" aria-label="خروج"><Icon name="logout"/></button></form></div></header>
    <main id="main" className="account-page admin-page">{children}</main><footer className="admin-footer"><span>الفردوس · إدارة طلبات الجملة</span><span>الإسكندرية، مصر</span></footer></div>
  </div>;
}
