import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, BOOTSTRAP_OWNER_USER_ID: id } = process.env;
const { values } = parseArgs({ options: { phone: { type: "string" } } });
const phone = values.phone?.trim().replace(/^0/, "+20");
if (!url || !key || (phone ? !/^\+201[0125]\d{8}$/.test(phone) : !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? ""))) {
  console.error("Set the Supabase URL, server-only key and existing owner user UUID in .env.local.");
  process.exit(1);
}
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: profile, error: profileError } = await client.from("profiles").select("id,active").eq(phone ? "phone" : "id", phone || id).single();
if (profileError || !profile?.active) {
  console.error("Owner must be an existing active phone-auth profile. No changes made.");
  process.exit(1);
}
const { error } = await client.from("staff_assignments").upsert({ user_id: profile.id, role: "OWNER", active: true });
if (error) {
  console.error("Owner bootstrap failed. Check migrations and server credentials. No secrets logged.");
  process.exit(1);
}
console.log("Owner role assigned. This operation is recorded in audit_logs.");
