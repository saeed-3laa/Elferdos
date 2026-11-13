import Link from "next/link";
import {requireStaff} from "@/server/auth/staff";
import {PermissionsForm} from "@/components/customer-admin-forms";
import {z} from "zod";
const labels:Record<string,string>={OWNER:"مالك",MANAGER:"مدير",ORDER_STAFF:"موظف طلبات",VIEWER:"مشاهد"};
export default async function Page({searchParams}:{searchParams:Promise<{q?:string;after?:string}>}){
 const {client}=await requireStaff("staff.manage");const params=await searchParams;const q=(params.q??"").trim().slice(0,100);
 let query=client.from("profiles").select("id,full_name,phone,active,staff_assignments(role,active)").eq("account_kind","STAFF").order("id").limit(25);
 if(q)query=/^[+0-9]+$/.test(q)?query.ilike("phone",`%${q.replace(/^0/,"20")}%`):query.ilike("full_name",`%${q}%`);
 if(z.uuid().safeParse(params.after).success)query=query.gt("id",params.after!);
 const [profiles,permissions]=await Promise.all([query,client.from("role_permissions").select("role,permission")]);if(profiles.error||permissions.error)throw new Error("STAFF_UNAVAILABLE");
 const rows=profiles.data.slice(0,24);
 return <><div className="admin-heading"><h1>فريق الإدارة</h1><Link className="button" href="/admin/staff/new">إضافة موظف</Link></div><p>حسابات الإدارة مستقلة عن العملاء، وكل موظف يدخل حسب صلاحياته.</p><form className="admin-filters"><label>اسم الموظف أو الموبايل<input name="q" defaultValue={q} maxLength={100}/></label><button className="button">بحث الموظفين</button></form>{!rows.length?<p className="form-panel">{q?"مفيش نتائج مطابقة للبحث.":"لا يوجد موظفين في الصفحة دي."} {q&&<Link className="text-link" href="/admin/staff">مسح البحث</Link>}</p>:<div className="table-scroll"><table className="admin-table"><thead><tr><th>الموظف</th><th>الموبايل</th><th>الدور</th><th>الوصول</th></tr></thead><tbody>{rows.map(p=>{const a=p.staff_assignments[0];return <tr key={p.id}><td><Link className="text-link" href={`/admin/staff/${p.id}`}>{p.full_name||"موظف إدارة"}</Link></td><td><bdi>{p.phone}</bdi></td><td>{labels[a?.role]??"بدون تعيين"}</td><td>{p.active&&a?.active?"مفعّل":"موقوف"}</td></tr>;})}</tbody></table></div>}<div className="pagination">{profiles.data.length>24&&<Link href={`/admin/staff?${new URLSearchParams({q,after:rows.at(-1)!.id})}`}>الموظفون التاليون</Link>}</div><section className="admin-section"><h2>صلاحيات أدوار الموظفين</h2><p>تغيير الدور يسري على كل الموظفين المعينين له؛ المالك كامل الصلاحيات.</p><div className="reference-grid">{["MANAGER","ORDER_STAFF","VIEWER"].map(role=><PermissionsForm key={role} role={role} permissions={permissions.data.filter(p=>p.role===role).map(p=>p.permission)}/>)}</div></section></>;
}
