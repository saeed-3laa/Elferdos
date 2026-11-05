import type { CartItem } from "@/domain/orders";
import type { AdminNavItem } from "@/components/admin-navigation";

export const existingCart: CartItem[] = [
  { unit_id: "30000000-0000-4000-8000-000000000001", quantity: 6, name: "صنف محفوظ أول", unit_name: "كرتونة", minimum_quantity: 3 },
  { unit_id: "30000000-0000-4000-8000-000000000002", quantity: 12, name: "صنف محفوظ ثانٍ", unit_name: "بالتة", minimum_quantity: 6 },
];
export const reorderItems: CartItem[] = [
  { unit_id: "30000000-0000-4000-8000-000000000003", quantity: 4, name: "صنف الطلب السابق", unit_name: "كرتونة" },
];

export const adminItems: AdminNavItem[] = [
  { href: "/admin", label: "الرئيسية", icon: "grid", group: "مساحة العمل" },
  { href: "/admin/orders", label: "الطلبات والتحصيل", icon: "cart", group: "مساحة العمل" },
  { href: "/admin/products", label: "المنتجات", icon: "box", group: "مساحة العمل" },
  { href: "/admin/returns", label: "المرتجعات", icon: "box", group: "مساحة العمل" },
  { href: "/admin/customers", label: "العملاء", icon: "users", group: "مساحة العمل" },
  { href: "/admin/categories", label: "الأقسام", icon: "grid", group: "إدارة المتجر" },
  { href: "/admin/pricing", label: "العروض والأسعار", icon: "tag", group: "إدارة المتجر" },
  { href: "/admin/zones", label: "مناطق التوصيل", icon: "truck", group: "إدارة المتجر" },
  { href: "/admin/reports", label: "التقارير", icon: "report", group: "البيانات والإعدادات" },
  { href: "/admin/excel", label: "Excel", icon: "excel", group: "البيانات والإعدادات" },
  { href: "/admin/staff", label: "فريق الإدارة", icon: "shield", group: "البيانات والإعدادات" },
  { href: "/admin/settings", label: "الإعدادات", icon: "settings", group: "البيانات والإعدادات" },
  { href: "/admin/profile", label: "حسابي وكلمة المرور", icon: "user", group: "البيانات والإعدادات" },
  { href: "/admin/audit", label: "سجل المراجعة", icon: "history", group: "البيانات والإعدادات" },
];
