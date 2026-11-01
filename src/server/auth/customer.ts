import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/server/supabase/session";

export const requireAccount = cache(async () => {
  const client = await createSessionClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) redirect("/login");
  const { data: profile, error: profileError } = await client.from("profiles")
    .select("id,phone,full_name,shop_name,delivery_address,area,delivery_notes,active,account_kind,login_email,legacy_staff_login")
    .eq("id", user.id).eq("active", true).maybeSingle();
  if (profileError) throw new Error("CUSTOMER_PROFILE_UNAVAILABLE");
  if (!profile) redirect("/login?notice=inactive");
  return { client, user, profile };
});

export const requireCustomer = cache(async()=>{const account=await requireAccount();if(account.profile.account_kind==="STAFF")redirect("/admin");return account;});
