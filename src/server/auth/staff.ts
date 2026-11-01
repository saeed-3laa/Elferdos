import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { staffAccessSchema } from "@/domain/admin";
import { requireAccount } from "@/server/auth/customer";
import { getSupabaseConfig } from "@/server/config";

const staffSession = cache(async () => {
  if (!getSupabaseConfig()) redirect("/login");
  const session = await requireAccount();
  const { data, error } = await session.client.rpc("get_staff_access");
  if (error) throw new Error("STAFF_ACCESS_UNAVAILABLE");
  const access = staffAccessSchema.safeParse(data);
  if (!access.success) redirect("/account?notice=staff-only");
  if(access.data.email_required&&!access.data.email_ready)redirect("/security/email");
  if(access.data.mfa_required&&!access.data.mfa_verified)redirect("/security/mfa");
  return { ...session, access: access.data };
});
export async function requireStaff(permission?: string) {
  const session = await staffSession();
  if (permission && !session.access.permissions.includes(permission)) redirect("/admin?notice=forbidden");
  return session;
}
