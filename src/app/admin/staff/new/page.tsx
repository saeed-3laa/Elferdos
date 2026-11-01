import Link from "next/link";
import {requireStaff} from "@/server/auth/staff";
import {StaffCreateForm} from "@/components/staff-account-forms";
export default async function Page(){await requireStaff("staff.manage");return <><Link className="text-link" href="/admin/staff">فريق الإدارة</Link><h1>إضافة موظف</h1><StaffCreateForm/></>;}
