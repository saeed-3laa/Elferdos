import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from "vitest";

// Real PostgreSQL engine. Only Supabase's auth schema/roles are a fixture.
// This does NOT test the GoTrue HTTP service, JWT verification or PostgREST.
let db: PGlite;
const ids = {
  alice: "40000000-0000-4000-8000-000000000001",
  bob: "40000000-0000-4000-8000-000000000002",
  owner: "40000000-0000-4000-8000-000000000003",
  manager: "40000000-0000-4000-8000-000000000004",
  staff: "40000000-0000-4000-8000-000000000005",
  viewer: "40000000-0000-4000-8000-000000000006",
};
const product = "20000000-0000-4000-8000-000000000001";
const zone = "50000000-0000-4000-8000-000000000001";

async function asUser(id: string) {
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id]);
  await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({session_id:id})]);
  await db.exec("set local role authenticated");
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    create schema auth;
    grant usage on schema auth to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table auth.users(id uuid primary key, phone text, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create table auth.mfa_factors(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),factor_type text,status text);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text);
  `);
  await db.exec(await readFile("supabase/migrations/202610250001_foundation.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610250002_customer_accounts.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610250003_admin_catalog.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610250004_automatic_product_codes.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610260005_product_images.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610260006_orders_pricing.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610260007_operations.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610260008_catalog_finishing.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610260009_security_limits.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610260010_role_guards.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610260011_catalog_query_plan.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610260012_catalog_indexes.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610260013_report_identity.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610260014_search_suggestions.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610260015_shop_delivery_address.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610270016_simple_order_workflow.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610270017_order_amendments.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610270018_catalog_offers.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610280019_separate_staff_accounts.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610280020_admin_mfa.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610280021_mfa_readiness.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610280022_staff_email_login.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610280023_enrolled_mfa_enforcement.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610280024_order_delivery_day.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610290025_free_delivery.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610290026_returns_and_cancellation.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610290027_default_address_export_and_return_limits.sql", "utf8"));
  await db.exec(await readFile("supabase/seed.sql", "utf8"));
  for (const [index, id] of Object.values(ids).entries()) {
    await db.query("insert into auth.users(id, phone, raw_user_meta_data,email,email_confirmed_at) values ($1, $2, $3,$1::uuid::text||'@example.test',now())", [id, `20100000000${index}`, JSON.stringify({ full_name: "عميل خيالي", role: "OWNER" })]);
    await db.query("insert into auth.sessions(id,user_id) values($1,$1)",[id]);
  }
  for (const role of ["owner", "manager", "staff", "viewer"] as const) {
    await db.query("insert into public.staff_assignments(user_id, role) values ($1, $2)", [ids[role], role === "staff" ? "ORDER_STAFF" : role.toUpperCase()]);
  }
  await db.exec("update public.profiles set legacy_staff_login=true where account_kind='STAFF'");
  await db.query("insert into public.delivery_zones(id, name, fee_piastres, active) values ($1, 'منطقة خيالية', 0, true)", [zone]);
  await db.query("insert into public.customer_addresses(customer_id, zone_id, address) values ($1, $3, 'عنوان العميل الأول الخيالي'), ($2, $3, 'عنوان العميل الثاني الخيالي')", [ids.alice, ids.bob, zone]);
});
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });

describe("public offers ordering", () => {
  it("puts a later SKU promotion first across cursor pages without duplicates", async () => {
    await db.exec("insert into public.pricing_rules(name,product_id,kind,value,starts_at,ends_at) values('عرض التسالي','20000000-0000-4000-8000-000000000002','percent',1000,now()-interval '1 day',now()+interval '1 day')");
    await db.exec("set local role anon");
    const first=await db.query<{unit_id:string;sku:string}>("select unit_id,sku from public.browse_catalog('',null,1)");
    expect(first.rows[0]!.sku).toBe("DEMO-SNACK");
    const next=await db.query<{unit_id:string;sku:string}>("select unit_id,sku from public.browse_catalog('',$1,1)",[first.rows[0]!.unit_id]);
    expect(next.rows[0]!.sku).toBe("DEMO-DRINK");
    expect((await db.query("select * from public.browse_catalog('',$1,1)",[next.rows[0]!.unit_id])).rows).toEqual([]);
    expect((await db.query<{sku:string}>("select sku from public.browse_catalog('',null,1,null,'sku')")).rows[0]!.sku).toBe("DEMO-DRINK");
  });
  it("does not promote private, expired, or higher quantity prices", async () => {
    await db.query("insert into public.pricing_rules(name,product_id,customer_id,kind,value,minimum_quantity,starts_at,ends_at) values('خاص','20000000-0000-4000-8000-000000000002',$1,'fixed',1,1,now()-interval '1 day',now()+interval '1 day'),('منتهي','20000000-0000-4000-8000-000000000002',null,'fixed',1,1,now()-interval '2 days',now()-interval '1 day'),('كمية أكبر','20000000-0000-4000-8000-000000000002',null,'fixed',1,100,now()-interval '1 day',now()+interval '1 day')",[ids.alice]);
    await db.exec("set local role anon");
    expect((await db.query<{sku:string}>("select sku from public.browse_catalog('',null,1)")).rows[0]!.sku).toBe("DEMO-DRINK");
    expect((await db.query("select price_piastres::int from public.browse_catalog('DEMO-SNACK')")).rows).toEqual([{price_piastres:18000}]);
  });
});

describe("live search suggestions", () => {
  it("matches Arabic product prefixes from one letter and partial codes", async () => {
    await db.exec("set local role anon");
    expect((await db.query("select value from public.search_suggestions('catalog','م')")).rows.length).toBeGreaterThan(0);
    expect((await db.query("select value from public.search_suggestions('catalog','مش')")).rows).toEqual([{value:"DEMO-DRINK"}]);
    expect((await db.query("select value from public.search_suggestions('catalog','DEMO-DR')")).rows).toEqual([{value:"DEMO-DRINK"}]);
  });
  it("never returns inactive or archived products to visitors", async () => {
    await db.query("update public.products set active=false where id=$1",[product]);
    await db.exec("set local role anon");
    expect((await db.query("select * from public.search_suggestions('catalog','مش')")).rows).toEqual([]);
  });
  it("keeps private scopes protected even for an empty query", async () => {
    await db.exec("set local role anon");
    await expect(db.query("select * from public.search_suggestions('customers','')")).rejects.toThrow("FORBIDDEN");
  });
  it("does not let a customer enumerate orders", async () => {
    await asUser(ids.alice);
    await expect(db.query("select * from public.search_suggestions('orders','1')")).rejects.toThrow("FORBIDDEN");
  });
  it("searches customer names and partial local and Arabic phone numbers for authorized staff", async () => {
    await asUser(ids.owner);
    expect((await db.query("select * from public.search_suggestions('customers','عم')")).rows.length).toBeGreaterThan(0);
    expect((await db.query("select * from public.search_suggestions('customers','٠١٠٠')")).rows.length).toBeGreaterThan(0);
    expect((await db.query("select * from public.search_suggestions('customers','% | !')")).rows).toEqual([]);
  });
  it("respects product category/state filters and bounds the response", async () => {
    await asUser(ids.owner);
    expect((await db.query("select * from public.search_suggestions('products','م',null,'inactive')")).rows).toEqual([]);
    expect((await db.query("select * from public.search_suggestions('products','م','10000000-0000-4000-8000-000000000099')")).rows).toEqual([]);
    expect((await db.query("select * from public.search_suggestions('products','م')")).rows.length).toBeLessThanOrEqual(8);
  });
});

describe("shop address reuse", () => {
  it("creates and selects the registered shop address without entering it again",async()=>{
    await asUser(ids.alice);
    await db.query("update public.profiles set delivery_address='عنوان المحل المسجل داخل الإسكندرية',area='منطقة خيالية',delivery_notes='الدور الأول' where id=$1",[ids.alice]);
    const saved=(await db.query<{id:string;address:string;notes:string}>("select id,address,notes from public.customer_addresses where from_profile")).rows;
    expect(saved).toHaveLength(1);expect(saved[0]).toMatchObject({address:'عنوان المحل المسجل داخل الإسكندرية',notes:'الدور الأول'});
    await db.query("select public.save_shop_delivery_zone($1)",[zone]);
    await db.query("select public.save_shop_delivery_zone($1)",[zone]);
    expect((await db.query("select id from public.customer_addresses where from_profile")).rows).toEqual([{id:saved[0]!.id}]);
  });
  it("does not guess an unknown zone and copies the profile when a zone is explicitly selected",async()=>{
    await asUser(ids.alice);await db.query("update public.profiles set delivery_address='عنوان أصلي لا يحتاج إعادة الكتابة',area='اسم منطقة غير مسجل' where id=$1",[ids.alice]);
    expect((await db.query("select id from public.customer_addresses where from_profile")).rows).toEqual([]);
    await db.query("select public.save_shop_delivery_zone($1)",[zone]);
    expect((await db.query("select address from public.customer_addresses where from_profile")).rows).toEqual([{address:'عنوان أصلي لا يحتاج إعادة الكتابة'}]);
  });
  it("preserves an alternative default while updating the shop address",async()=>{
    await asUser(ids.alice);const other=(await db.query<{id:string}>("select id from public.customer_addresses")).rows[0]!.id;
    await db.query("select public.save_customer_address($1,$2,'عنوان آخر اختاره العميل', '',true)",[other,zone]);
    await db.query("update public.profiles set delivery_address='عنوان المحل المحدث داخل الإسكندرية',area='منطقة خيالية' where id=$1",[ids.alice]);
    expect((await db.query("select id from public.customer_addresses where is_default")).rows).toEqual([{id:other}]);
  });
  it("removes the previous shop delivery mapping if the profile zone becomes unresolved",async()=>{
    await asUser(ids.alice);await db.query("update public.profiles set delivery_address='عنوان المحل المسجل داخل الإسكندرية',area='منطقة خيالية' where id=$1",[ids.alice]);
    await db.query("update public.profiles set area='منطقة غير معروفة' where id=$1",[ids.alice]);
    expect((await db.query("select id from public.customer_addresses where from_profile")).rows).toEqual([]);
  });
  it("does not let another customer select or edit someone else's shop address",async()=>{
    await asUser(ids.bob);
    expect((await db.query("select id from public.customer_addresses where customer_id=$1",[ids.alice])).rows).toEqual([]);
  });
  it("rejects an inactive delivery zone",async()=>{
    await db.query("update public.delivery_zones set active=false where id=$1",[zone]);await asUser(ids.alice);
    await expect(db.query("select public.save_shop_delivery_zone($1)",[zone])).rejects.toThrow('ZONE_UNAVAILABLE');
  });
});

describe("customer address transactions", () => {
  it("sets one default, preserves it on edit, and selects a replacement after deletion", async () => {
    await asUser(ids.alice);
    const first = await db.query<{ id: string }>("select public.save_customer_address(null,$1,'عنوان أول خيالي طويل','','true') as id", [zone]);
    const second = await db.query<{ id: string }>("select public.save_customer_address(null,$1,'عنوان ثان خيالي طويل','','true') as id", [zone]);
    expect((await db.query("select id from public.customer_addresses where is_default")).rows).toEqual([{ id: second.rows[0]!.id }]);
    await db.query("select public.save_customer_address($1,$2,'عنوان معدل خيالي طويل','',false)", [second.rows[0]!.id, zone]);
    expect((await db.query("select id from public.customer_addresses where is_default")).rows).toEqual([{ id: second.rows[0]!.id }]);
    await db.query("select public.delete_customer_address($1)", [second.rows[0]!.id]);
    const defaults = await db.query("select id from public.customer_addresses where is_default");
    expect(defaults.rows).toHaveLength(1);
    expect(defaults.rows[0]).not.toEqual({ id: second.rows[0]!.id });
    expect(first.rows[0]!.id).toBeTruthy();
  });
  it("rejects editing another customer's saved address", async () => {
    const other = await db.query<{ id: string }>("select id from public.customer_addresses where customer_id=$1", [ids.bob]);
    await asUser(ids.alice);
    await expect(db.query("select public.save_customer_address($1,$2,'عنوان غير مصرح طويل','',true)", [other.rows[0]!.id, zone])).rejects.toThrow("ADDRESS_UNAVAILABLE");
  });
  it("rejects deleting another customer's saved address", async () => {
    const other = await db.query<{ id: string }>("select id from public.customer_addresses where customer_id=$1", [ids.bob]);
    await asUser(ids.alice);
    await expect(db.query("select public.delete_customer_address($1)", [other.rows[0]!.id])).rejects.toThrow("ADDRESS_UNAVAILABLE");
  });
  it("rejects inactive zones without changing the customer's default", async () => {
    await db.query("update public.delivery_zones set active=false where id=$1", [zone]);
    await asUser(ids.alice);
    await expect(db.query("select public.save_customer_address(null,$1,'عنوان تجريبي طويل','',true)", [zone])).rejects.toThrow("ZONE_UNAVAILABLE");
  });
  it("caps addresses per customer", async () => {
    await db.query("insert into public.customer_addresses(customer_id,zone_id,address) select $1,$2,'عنوان محلي تجريبي' from generate_series(1,24)", [ids.alice, zone]);
    await asUser(ids.alice);
    await expect(db.query("select public.save_customer_address(null,$1,'عنوان محلي إضافي','',true)", [zone])).rejects.toThrow("ADDRESS_LIMIT");
  });
  it("rejects anonymous address operations", async () => {
    await db.exec("set local role anon");
    await expect(db.query("select public.save_customer_address(null,$1,'عنوان محلي إضافي','',true)", [zone])).rejects.toThrow(/permission denied/i);
  });
});

describe("distributed login limits", () => {
  it("allows the limit then denies attempts until the next window", async () => {
    await db.exec("set local role service_role");
    const bucket = "a".repeat(64);
    const first = await db.query("select public.consume_auth_limit($1,2,86400) as allowed", [bucket]);
    const second = await db.query("select public.consume_auth_limit($1,2,86400) as allowed", [bucket]);
    const third = await db.query("select public.consume_auth_limit($1,2,86400) as allowed", [bucket]);
    expect(first.rows).toEqual([{ allowed: true }]);
    expect(second.rows).toEqual([{ allowed: true }]);
    expect(third.rows).toEqual([{ allowed: false }]);
  });
  it("does not expose counters to customers", async () => {
    await asUser(ids.alice);
    await expect(db.query("select public.consume_auth_limit($1,2,900)", ["a".repeat(64)])).rejects.toThrow(/permission denied/i);
  });
  it("rejects invalid limits even for the server role", async () => {
    await db.exec("set local role service_role");
    await expect(db.query("select public.consume_auth_limit($1,0,900)", ["a".repeat(64)])).rejects.toThrow("INVALID_RATE_LIMIT");
  });
  it("prunes expired counters in bounded batches", async () => {
    await db.query("insert into private.auth_rate_limits values ($1,now()-interval '3 days',now()-interval '2 days',1)", ["b".repeat(64)]);
    await db.exec("set local role service_role");
    await db.query("select public.consume_auth_limit($1,2,900)", ["a".repeat(64)]);
    await db.exec("reset role");
    expect((await db.query("select * from private.auth_rate_limits where bucket_hash=$1", ["b".repeat(64)])).rows).toEqual([]);
  });
});

describe("migration and public catalogue", () => {
  it("revokes anonymous mutation functions and audit sequences despite Supabase defaults", async () => {
    const result = await db.query("select has_function_privilege('anon', 'public.adjust_inventory(uuid,bigint,bigint,text)', 'EXECUTE') as can_mutate, has_sequence_privilege('anon', 'public.audit_logs_id_seq', 'USAGE') as can_sequence");
    expect(result.rows).toEqual([{ can_mutate: false, can_sequence: false }]);
  });
  it("enables RLS on every public table", async () => {
    const result = await db.query("select tablename from pg_tables where schemaname = 'public' and not rowsecurity");
    expect(result.rows).toEqual([]);
  });
  it("lets anonymous visitors browse only the safe projection", async () => {
    await db.exec("set local role anon");
    const result = await db.query("select * from public.browse_catalog()");
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).not.toHaveProperty("quantity_pieces");
    expect(result.rows[0]).not.toHaveProperty("reserved_pieces");
    await expect(db.query("select * from public.profiles")).rejects.toThrow(/permission denied/i);
  });
  it("hides inactive products", async () => {
    await db.query("update public.products set active=false where id=$1", [product]);
    await db.exec("set local role anon");
    expect((await db.query("select * from public.browse_catalog()")).rows).toHaveLength(1);
  });
  it("hides archived products", async () => {
    await db.query("update public.products set archived_at=now() where id=$1", [product]);
    await db.exec("set local role anon");
    expect((await db.query("select * from public.browse_catalog()")).rows).toHaveLength(1);
  });
  it("hides inactive categories", async () => {
    await db.query("update public.categories set active=false");
    await db.exec("set local role anon");
    expect((await db.query("select * from public.browse_catalog()")).rows).toEqual([]);
  });
  it("searches Arabic words and exact SKU", async () => {
    await db.exec("set local role anon");
    expect((await db.query("select * from public.browse_catalog('مَشروب')")).rows).toHaveLength(1);
    expect((await db.query("select * from public.browse_catalog('demo-drink')")).rows).toHaveLength(1);
  });
  it("uses a bounded cursor without repeated rows", async () => {
    await db.exec("set local role anon");
    const first = await db.query<{ unit_id: string }>("select * from public.browse_catalog('', null, 1)");
    const next = await db.query<{ unit_id: string }>("select * from public.browse_catalog('', $1, 1)", [first.rows[0]!.unit_id]);
    expect(next.rows).toHaveLength(1);
    expect(next.rows[0]!.unit_id).not.toBe(first.rows[0]!.unit_id);
  });
  it("rejects unbounded queries", async () => {
    await db.exec("set local role anon");
    await expect(db.query("select * from public.browse_catalog('', null, 10000)")).rejects.toThrow("INVALID_CATALOG_QUERY");
  });
  it("blocks stale stock by default", async () => {
    await db.query("update public.inventory set stock_updated_at=now()-interval '2 days'");
    const result = await db.query<{ available: boolean }>("select * from public.browse_catalog()");
    expect(result.rows.every((row) => !row.available)).toBe(true);
  });
  it("supports the explicit warn policy", async () => {
    await db.query("update public.inventory set stock_updated_at=now()-interval '2 days'");
    await db.query("update public.store_settings set stale_stock_policy='warn'");
    const result = await db.query<{ available: boolean }>("select * from public.browse_catalog()");
    expect(result.rows.every((row) => row.available)).toBe(true);
  });
  it("counts only unreserved full wholesale units", async () => {
    await db.query("update public.inventory set reserved_pieces=quantity_pieces-23 where product_id=$1", [product]);
    const result = await db.query<{ available: boolean }>("select * from public.browse_catalog('DEMO-DRINK')");
    expect(result.rows[0]!.available).toBe(false);
  });
});

describe("customer isolation and protected identities", () => {
  it("returns only the current customer's profile and addresses", async () => {
    await asUser(ids.alice);
    expect((await db.query("select id from public.profiles")).rows).toEqual([{ id: ids.alice }]);
    expect((await db.query("select customer_id from public.customer_addresses")).rows).toEqual([{ customer_id: ids.alice }]);
  });
  it("cannot create another customer's address", async () => {
    await asUser(ids.alice);
    await expect(db.query("insert into public.customer_addresses(customer_id, zone_id, address) values ($1, $2, 'عنوان غير مصرح')", [ids.bob, zone])).rejects.toThrow(/permission denied/i);
  });
  it("can update own contact details but cannot change phone identity", async () => {
    await asUser(ids.alice);
    const result = await db.query("update public.profiles set shop_name='محل خيالي' where id=$1 returning shop_name", [ids.alice]);
    expect(result.rows).toEqual([{ shop_name: "محل خيالي" }]);
    await expect(db.query("update public.profiles set phone='+201099999999' where id=$1", [ids.alice])).rejects.toThrow(/permission denied/i);
  });
  it("cannot modify another profile", async () => {
    await asUser(ids.alice);
    expect((await db.query("update public.profiles set shop_name='غير مصرح' where id=$1 returning id", [ids.bob])).rows).toEqual([]);
  });
  it("ignores role supplied in auth user metadata", async () => {
    await asUser(ids.alice);
    expect((await db.query("select private.has_permission('staff.manage') as allowed")).rows).toEqual([{ allowed: false }]);
    await expect(db.query("insert into public.staff_assignments(user_id, role) values ($1, 'OWNER')", [ids.alice])).rejects.toThrow(/permission denied/i);
  });
  it("blocks disabled customer records", async () => {
    await db.query("update public.profiles set active=false where id=$1", [ids.alice]);
    await asUser(ids.alice);
    expect((await db.query("select * from public.customer_addresses")).rows).toEqual([]);
  });
});

describe("staff permissions and manual inventory", () => {
  it("allows managers to update product prices and audits the change", async () => {
    await asUser(ids.manager);
    expect((await db.query("select public.save_admin_unit('30000000-0000-4000-8000-000000000001',$1,0,'بالتة',24,25000,1,true)", [product])).rows).toHaveLength(1);
    await db.exec("reset role");
    const result = await db.query("select actor_id from public.audit_logs where entity='product_units' and operation='UPDATE'");
    expect(result.rows).toEqual([{ actor_id: ids.manager }]);
  });
  it.each(["staff", "viewer", "alice"] as const)("prevents %s from updating protected prices", async (actor) => {
    await asUser(ids[actor]);
    await expect(db.query("select public.save_admin_unit('30000000-0000-4000-8000-000000000001',$1,0,'بالتة',24,1,1,true)", [product])).rejects.toThrow("FORBIDDEN");
  });
  it("rejects fractional/single-piece wholesale factors", async () => {
    await asUser(ids.manager);
    await expect(db.query("select public.save_admin_unit('30000000-0000-4000-8000-000000000001',$1,0,'بالتة',1,24000,1,true)", [product])).rejects.toThrow("INVALID_WHOLESALE_UNIT");
  });
  it("records previous/new quantities and actor for stock updates", async () => {
    await asUser(ids.manager);
    await db.query("select public.adjust_inventory($1, 600, 1, 'manual')", [product]);
    const result = await db.query("select previous_quantity::int, new_quantity::int, actor_id from public.stock_movements where source='manual'");
    expect(result.rows).toEqual([{ previous_quantity: 480, new_quantity: 600, actor_id: ids.manager }]);
  });
  it("rejects a stale admin edit rather than overwriting a newer count", async () => {
    await asUser(ids.manager);
    await db.query("select public.adjust_inventory($1, 600, 1, 'manual')", [product]);
    await expect(db.query("select public.adjust_inventory($1, 700, 1, 'manual')", [product])).rejects.toThrow("STOCK_VERSION_CONFLICT");
  });
  it("rejects counts below reservations", async () => {
    await db.query("update public.inventory set reserved_pieces=100 where product_id=$1", [product]);
    await asUser(ids.manager);
    await expect(db.query("select public.adjust_inventory($1, 99, 1, 'manual')", [product])).rejects.toThrow("BELOW_RESERVED_STOCK");
  });
  it("prevents direct inventory edits even by a manager", async () => {
    await asUser(ids.manager);
    await expect(db.query("update public.inventory set quantity_pieces=900")).rejects.toThrow(/permission denied/i);
  });
  it("rejects stock updates by order staff", async () => {
    await asUser(ids.staff);
    await expect(db.query("select public.adjust_inventory($1, 600, 1, 'manual')", [product])).rejects.toThrow("FORBIDDEN");
  });
  it("prevents audit log modification", async () => {
    await asUser(ids.owner);
    await expect(db.query("delete from public.audit_logs")).rejects.toThrow(/permission denied/i);
  });
});

describe("admin catalogue operations", () => {
  const unit = "30000000-0000-4000-8000-000000000001";
  const category = "10000000-0000-4000-8000-000000000001";
  it("generates unique codes, skips manual collisions and keeps existing codes on blank edits", async () => {
    await db.query("select setval('private.product_sku_sequence',1,false)");
    await asUser(ids.manager);
    await db.query("select public.save_admin_product(null,0,'FD-000001','منتج بكود يدوي',$1,'',false)", [category]);
    const created = await db.query<{ id: string }>("select public.save_admin_product(null,0,'  ','منتج تلقائي',$1,'',false) as id", [category]);
    const id = created.rows[0]!.id;
    expect((await db.query("select sku from public.products where id=$1", [id])).rows).toEqual([{ sku: "FD-000002" }]);
    await db.query("select public.save_admin_product($1,0,null,'منتج معدل',$2,'',false)", [id,category]);
    expect((await db.query("select sku,name from public.products where id=$1", [id])).rows).toEqual([{ sku: "FD-000002", name: "منتج معدل" }]);
    const next = await db.query<{ id: string }>("select public.save_admin_product(null,0,null,'منتج تلقائي آخر',$1,'',false) as id", [category]);
    expect((await db.query("select sku from public.products where id=$1", [next.rows[0]!.id])).rows).toEqual([{ sku: "FD-000003" }]);
  });
  it("still rejects invalid nonempty product codes", async () => {
    await asUser(ids.manager);
    await expect(db.query("select public.save_admin_product(null,0,'INVALID CODE','منتج',$1,'',false)", [category])).rejects.toThrow("INVALID_PRODUCT");
  });
  it.each(["alice", "owner", "manager", "viewer"] as const)("returns only %s's actual staff access", async (actor) => {
    await asUser(ids[actor]);
    const { rows } = await db.query<{ access: { role: string; permissions: string[] } | null }>("select public.get_staff_access() as access");
    if (actor === "alice") expect(rows[0]!.access).toBeNull();
    else {
      expect(rows[0]!.access!.role).toBe(actor.toUpperCase());
      expect(rows[0]!.access!.permissions.includes("settings.write")).toBe(actor === "owner");
    }
  });
  it("revokes access immediately when a staff assignment is disabled", async () => {
    await db.query("update public.staff_assignments set active=false where user_id=$1", [ids.owner]);
    await asUser(ids.owner);
    expect((await db.query("select public.get_staff_access() as access")).rows).toEqual([{ access: null }]);
    await expect(db.query("select * from public.admin_products()")).rejects.toThrow("FORBIDDEN");
  });
  it("creates products with zero inventory, wholesale units, and independent prices", async () => {
    await asUser(ids.manager);
    const created = await db.query<{ id: string }>("select public.save_admin_product(null,0,'qa-carton','منتج اختبار',$1,'وصف',true) as id", [category]);
    const id = created.rows[0]!.id;
    expect((await db.query("select quantity_pieces::int from public.inventory where product_id=$1", [id])).rows).toEqual([{ quantity_pieces: 0 }]);
    await db.query("select public.save_admin_unit(null,$1,0,'كرتونة',12,12345,1,true)", [id]);
    await db.query("select public.save_admin_unit(null,$1,0,'بالتة',120,120000,1,true)", [id]);
    expect((await db.query("select price_piastres::int from public.product_units where product_id=$1 order by pieces_per_unit", [id])).rows).toEqual([{ price_piastres: 12345 }, { price_piastres: 120000 }]);
    expect((await db.query("select * from public.browse_catalog('QA-CARTON')")).rows).toHaveLength(2);
  });
  it("protects product edits against stale revisions", async () => {
    await asUser(ids.manager);
    await db.query("select public.save_admin_product($1,0,'DEMO-DRINK','اسم جديد',$2,'',true)", [product, category]);
    expect((await db.query("select revision::int,name from public.products where id=$1", [product])).rows).toEqual([{ revision: 1, name: "اسم جديد" }]);
    await expect(db.query("select public.save_admin_product($1,0,'DEMO-DRINK','اسم قديم',$2,'',true)", [product, category])).rejects.toThrow("EDIT_CONFLICT");
  });
  it("archives without deleting history and restores as inactive", async () => {
    await asUser(ids.owner);
    await db.query("select public.archive_admin_product($1,0,true)", [product]);
    expect((await db.query("select * from public.browse_catalog('DEMO-DRINK')")).rows).toHaveLength(0);
    expect((await db.query("select * from public.admin_products('DEMO-DRINK',null,'archived')")).rows).toHaveLength(1);
    await db.query("select public.archive_admin_product($1,1,false)", [product]);
    expect((await db.query("select active,archived_at,revision::int from public.products where id=$1", [product])).rows).toEqual([{ active: false, archived_at: null, revision: 2 }]);
    expect((await db.query<{ count: number }>("select count(*)::int as count from public.product_units where product_id=$1", [product])).rows[0]!.count).toBeGreaterThan(0);
  });
  it("converts whole cartons on the server and records their real actor", async () => {
    await asUser(ids.manager);
    await db.query("select public.set_inventory_by_unit($1,$2,25,1,'جرد اختبار')", [product, unit]);
    expect((await db.query("select quantity_pieces::int,version::int from public.inventory where product_id=$1", [product])).rows).toEqual([{ quantity_pieces: 600, version: 2 }]);
    expect((await db.query("select actor_id,new_quantity::int from public.stock_movements where source='جرد اختبار'")).rows).toEqual([{ actor_id: ids.manager, new_quantity: 600 }]);
  });
  it("rejects an inventory unit belonging to another product", async () => {
    await asUser(ids.manager);
    await expect(db.query("select public.set_inventory_by_unit($1,'30000000-0000-4000-8000-000000000002',25,1,'جرد اختبار')", [product])).rejects.toThrow("INVALID_STOCK_UPDATE");
  });
  it("locks unit conversion once stock has been recorded", async () => {
    await asUser(ids.manager);
    await expect(db.query("select public.save_admin_unit($1,$2,0,'بالتة',48,24000,1,true)", [unit, product])).rejects.toThrow("UNIT_CONVERSION_LOCKED");
  });
  it("keeps zones free even if a legacy caller supplies a fee, with an audit entry", async () => {
    await asUser(ids.owner);
    await db.query("select public.save_admin_reference('zone',$1,0,'منطقة معدلة',true,5555)", [zone]);
    expect((await db.query("select fee_piastres::int,revision::int from public.delivery_zones where id=$1", [zone])).rows).toEqual([{ fee_piastres: 0, revision: 1 }]);
    expect((await db.query("select actor_id from public.audit_logs where entity='delivery_zones' and operation='UPDATE'")).rows).toEqual([{ actor_id: ids.owner }]);
    await expect(db.query("select public.save_admin_reference('zone',$1,0,'قيمة قديمة',true,1)", [zone])).rejects.toThrow("EDIT_CONFLICT");
  });
  it("rejects manager edits to delivery policy", async () => {
    await asUser(ids.manager);
    await expect(db.query("select public.save_admin_reference('zone',null,0,'منطقة',true,1)")).rejects.toThrow("FORBIDDEN");
  });
  it("updates settings with a revision and rejects an older form", async () => {
    await asUser(ids.owner);
    await db.query("select public.save_admin_settings((select revision from public.store_settings where id),200000,48,'warn')");
    expect((await db.query("select stock_stale_hours,stale_stock_policy,revision::int from public.store_settings")).rows).toEqual([{ stock_stale_hours: 48, stale_stock_policy: "warn", revision: 2 }]);
    await expect(db.query("select public.save_admin_settings(0,100,24,'block')")).rejects.toThrow("EDIT_CONFLICT");
  });
  it("allows bounded read-only catalogue search with nonrepeating cursors", async () => {
    await asUser(ids.viewer);
    const first = await db.query<{ id: string }>("select * from public.admin_products('',null,'active','name',null,1)");
    const next = await db.query<{ id: string }>("select * from public.admin_products('',null,'active','name',$1,1)", [first.rows[0]!.id]);
    expect(next.rows).toHaveLength(1);
    expect(next.rows[0]!.id).not.toBe(first.rows[0]!.id);
    expect((await db.query("select * from public.admin_products('مَشروب')")).rows).toHaveLength(1);
    await expect(db.query("select * from public.admin_products('',null,'all','sku',null,1000)")).rejects.toThrow("INVALID_CATALOG_QUERY");
  });
  it.each(["products", "product_units", "categories", "delivery_zones", "store_settings"])("prevents direct writes to %s, even by owners", async (table) => {
    await asUser(ids.owner);
    await expect(db.exec(`delete from public.${table}`)).rejects.toThrow(/permission denied/i);
  });
  it("prevents anonymous use of admin projections", async () => {
    await db.exec("set local role anon");
    await expect(db.query("select * from public.admin_products()")).rejects.toThrow(/permission denied/i);
  });
});

describe("product image permissions and versioning",()=>{
  const path = `${product}/60000000-0000-4000-8000-000000000001.webp`;
  async function storageObject() { await db.query("insert into storage.objects(bucket_id,name) values('product-images',$1)",[path]); }
  it("attaches normalized images through the trusted handler and exposes only active catalogue images",async()=>{
    await storageObject();
    await db.exec("set local role service_role");
    await db.query("select public.commit_product_image($1,$2,0,$3,1280,640)",[ids.manager,product,path]);
    expect((await db.query("select revision::int from public.product_images where product_id=$1",[product])).rows).toEqual([{revision:1}]);
    await asUser(ids.owner);
    expect((await db.query("select actor_id from public.audit_logs where entity='product_images'")).rows).toEqual([{actor_id:ids.manager}]);
    await db.exec("set local role anon");
    expect((await db.query("select image_path,image_width from public.browse_catalog('DEMO-DRINK')")).rows).toEqual([{image_path:path,image_width:1280}]);
  });
  it("retains a revision after removal to reject old upload forms",async()=>{
    await storageObject();
    await db.exec("set local role service_role");
    await db.query("select public.commit_product_image($1,$2,0,$3,1280,640)",[ids.owner,product,path]);
    await db.query("select public.commit_product_image($1,$2,1,null,null,null)",[ids.owner,product]);
    expect((await db.query("select storage_path,revision::int from public.product_images where product_id=$1",[product])).rows).toEqual([{storage_path:null,revision:2}]);
    await expect(db.query("select public.commit_product_image($1,$2,0,$3,1280,640)",[ids.owner,product,path])).rejects.toThrow("EDIT_CONFLICT");
  });
  it.each(["alice","viewer","staff"] as const)("rejects %s even through the trusted handler",async(actor)=>{
    await db.exec("set local role service_role");
    await expect(db.query("select public.commit_product_image($1,$2,0,null,null,null)",[ids[actor],product])).rejects.toThrow("FORBIDDEN");
  });
  it("prevents a client from impersonating an owner in the commit RPC",async()=>{
    await asUser(ids.manager);
    await expect(db.query("select public.commit_product_image($1,$2,0,null,null,null)",[ids.owner,product])).rejects.toThrow(/permission denied/i);
  });
  it("prevents direct image metadata edits by an owner",async()=>{
    await asUser(ids.owner);
    await expect(db.query("insert into public.product_images(product_id,updated_by) values($1,$2)",[product,ids.owner])).rejects.toThrow(/permission denied/i);
  });
  it("requires an uploaded object before attaching a path",async()=>{
    await db.exec("set local role service_role");
    await expect(db.query("select public.commit_product_image($1,$2,0,$3,1280,640)",[ids.manager,product,path])).rejects.toThrow("INVALID_IMAGE");
  });
  it("does not attach a storage object from another product",async()=>{
    await storageObject();
    await db.exec("set local role service_role");
    await expect(db.query("select public.commit_product_image($1,'20000000-0000-4000-8000-000000000002',0,$2,1280,640)",[ids.manager,path])).rejects.toThrow("INVALID_IMAGE");
  });
  it("checks current role state again when committing",async()=>{
    await db.query("update public.staff_assignments set active=false where user_id=$1",[ids.manager]);
    await db.exec("set local role service_role");
    await expect(db.query("select public.commit_product_image($1,$2,0,null,null,null)",[ids.manager,product])).rejects.toThrow("FORBIDDEN");
  });
});

describe("pricing, checkout, reservations and fulfillment",()=>{
 const unit="30000000-0000-4000-8000-000000000001";
 const request="70000000-0000-4000-8000-000000000001";
 const items=[{unit_id:unit,quantity:1}];
 async function address(customer=ids.alice){return (await db.query<{id:string}>("select id from public.customer_addresses where customer_id=$1 limit 1",[customer])).rows[0]!.id;}
 async function quote(quantity=1){const addr=await address();await asUser(ids.alice);const q=(await db.query<{q:Record<string,unknown>}>("select public.quote_order($1,$2) q",[JSON.stringify([{unit_id:unit,quantity}]),addr])).rows[0]!.q;return {addr,q};}
 async function submit(){const {addr,q}=await quote();const id=(await db.query<{id:string}>("select public.submit_order($1,$2,$3,'cash','',$4) id",[request,JSON.stringify(items),addr,JSON.stringify(q)])).rows[0]!.id;return {id,addr,q};}
 async function ordered(quantity=3){const {addr,q}=await quote(quantity);const id=(await db.query<{id:string}>("select public.submit_order(gen_random_uuid(),$1,$2,'cash','',$3) id",[JSON.stringify([{unit_id:unit,quantity}]),addr,JSON.stringify(q)])).rows[0]!.id;await asUser(ids.staff);return id;}
 async function amendment(id:string,quantity:number,revision=0){const list=JSON.stringify([{unit_id:unit,quantity}]);const preview=(await db.query<{q:Record<string,unknown>}>("select public.preview_order_amendment($1,$2,$3) q",[id,revision,list])).rows[0]!.q;return {list,preview};}
 async function amend(id:string,quantity:number,revision=0,key="80000000-0000-4000-8000-000000000001"){const change=await amendment(id,quantity,revision);const result=await db.query<{id:string}>("select public.amend_order($1,$2,$3,$4,'نقص كمية بالمخزن',$5) id",[id,revision,key,change.list,JSON.stringify(change.preview)]);return {...change,id:result.rows[0]!.id};}

 it("schedules a confirmed order without changing state, price or reservation and notifies its customer once",async()=>{
  const id=await ordered(1);const date=(await db.query<{d:string}>("select ((statement_timestamp() at time zone 'Africa/Cairo')::date+1)::text d")).rows[0]!.d;
  await db.query("select public.schedule_order_delivery($1,0,$2::date)",[id,date]);await db.query("select public.schedule_order_delivery($1,0,$2::date)",[id,date]);
  expect((await db.query("select status,delivery_date::text,revision::int,total::int from public.orders where id=$1",[id])).rows).toEqual([{status:'CONFIRMED',delivery_date:date,revision:1,total:24000}]);
  await asUser(ids.alice);expect((await db.query("select kind,amendment_id from public.customer_notifications where order_id=$1",[id])).rows).toEqual([{kind:'delivery',amendment_id:null}]);
  await asUser(ids.bob);expect((await db.query("select id from public.customer_notifications where order_id=$1",[id])).rows).toEqual([]);expect((await db.query("select id from public.orders where id=$1",[id])).rows).toEqual([]);
  await db.exec("reset role");expect((await db.query("select reserved_pieces::int from public.inventory where product_id=$1",[product])).rows).toEqual([{reserved_pieces:24}]);
 });
 it.each([ids.alice,ids.bob,ids.viewer])("blocks unauthorized scheduling by %s",async actor=>{const id=await ordered(1);await asUser(actor);await expect(db.query("select public.schedule_order_delivery($1,0,(statement_timestamp() at time zone 'Africa/Cairo')::date)",[id])).rejects.toThrow('FORBIDDEN');});
 it.each([-1,3])("rejects a delivery day outside the current Cairo window: %s",async offset=>{const id=await ordered(1);await expect(db.query("select public.schedule_order_delivery($1,0,(statement_timestamp() at time zone 'Africa/Cairo')::date+$2::int)",[id,offset])).rejects.toThrow('INVALID_DELIVERY_DATE');});
 it("allows changing the day for a ready order and prevents overwriting a newer revision",async()=>{
  const id=await ordered(1);await db.query("select public.transition_order($1,0,'READY','تم تسجيله على بيلا')",[id]);await db.query("select public.schedule_order_delivery($1,1,(statement_timestamp() at time zone 'Africa/Cairo')::date)",[id]);await db.query("select public.schedule_order_delivery($1,2,(statement_timestamp() at time zone 'Africa/Cairo')::date+2)",[id]);
  expect((await db.query("select status,revision::int from public.orders where id=$1",[id])).rows).toEqual([{status:'READY',revision:3}]);
  await expect(db.query("select public.schedule_order_delivery($1,1,(statement_timestamp() at time zone 'Africa/Cairo')::date+1)",[id])).rejects.toThrow('EDIT_CONFLICT');
 });
 it.each(['DELIVERED','CANCELLED'])("blocks scheduling after final state %s",async status=>{const id=await ordered(1);await db.exec("reset role");await db.query("update public.orders set status=$2::public.order_status where id=$1",[id,status]);await asUser(ids.staff);await expect(db.query("select public.schedule_order_delivery($1,0,(statement_timestamp() at time zone 'Africa/Cairo')::date)",[id])).rejects.toThrow('ORDER_NOT_EDITABLE');});
 it("blocks direct delivery field writes even by staff",async()=>{const id=await ordered(1);await expect(db.query("update public.orders set delivery_date=current_date where id=$1",[id])).rejects.toThrow(/permission denied/i);});

 async function deliveredForReturn(quantity=3){const id=await ordered(quantity);await db.query("select public.transition_order($1,0,'READY','تم تجهيز الطلب')",[id]);await db.query("select public.complete_order($1,1,gen_random_uuid(),'cash','تحصيل التسليم',$2)",[id,quantity*24000]);return id;}
 async function requestedReturn(id:string,quantity=1){await asUser(ids.alice);return (await db.query<{id:string}>("select public.request_order_return($1,gen_random_uuid(),$2,'إرجاع صنف من الطلب') id",[id,JSON.stringify([{unit_id:unit,quantity}])])).rows[0]!.id;}
 it("lets a customer cancel only their confirmed order and releases its reservation once",async()=>{const {id}=await submit();await db.query("select public.cancel_customer_order($1,0)",[id]);await db.query("select public.cancel_customer_order($1,0)",[id]);expect((await db.query("select status from public.orders where id=$1",[id])).rows).toEqual([{status:'CANCELLED'}]);await db.exec("reset role");expect((await db.query("select reserved_pieces::int,quantity_pieces::int from public.inventory where product_id=$1",[product])).rows).toEqual([{reserved_pieces:0,quantity_pieces:480}]);});
 it("blocks another customer's cancellation",async()=>{const {id}=await submit();await asUser(ids.bob);await expect(db.query("select public.cancel_customer_order($1,0)",[id])).rejects.toThrow('FORBIDDEN');});
 it("blocks cancellation as soon as staff mark the order ready",async()=>{const id=await ordered(1);await db.query("select public.transition_order($1,0,'READY','تم التجهيز')",[id]);await asUser(ids.alice);await expect(db.query("select public.cancel_customer_order($1,1)",[id])).rejects.toThrow('ORDER_NOT_CANCELLABLE');});
 it("cancels a prepaid confirmed order without inventing a refund, then staff refund the actual funds",async()=>{const {id}=await submit();await asUser(ids.staff);await db.query("select public.record_payment($1,gen_random_uuid(),10000,'cash','دفعة مقدمة')",[id]);await asUser(ids.alice);await db.query("select public.cancel_customer_order($1,0)",[id]);expect((await db.query("select sum(amount)::int paid from public.order_payments where order_id=$1",[id])).rows).toEqual([{paid:10000}]);await asUser(ids.staff);await db.query("select public.record_payment($1,gen_random_uuid(),-10000,'cash','رد دفعة طلب ملغي')",[id]);expect((await db.query("select sum(amount)::int paid from public.order_payments where order_id=$1",[id])).rows).toEqual([{paid:0}]);});
 it("does not change stock or invoice while a customer return is pending",async()=>{const id=await deliveredForReturn();const r=await requestedReturn(id);expect((await db.query("select status,amount::int from public.order_returns where id=$1",[r])).rows).toEqual([{status:'REQUESTED',amount:24000}]);expect((await db.query("select total::int from public.orders where id=$1",[id])).rows).toEqual([{total:72000}]);await db.exec("reset role");expect((await db.query("select quantity_pieces::int from public.inventory where product_id=$1",[product])).rows).toEqual([{quantity_pieces:408}]);});
 it("restocks approved quantities and adjusts stored invoice prices once, with separately recorded refunds",async()=>{const id=await deliveredForReturn();const r=await requestedReturn(id);await asUser(ids.staff);await db.query("select public.review_order_return($1,true,'تم الاستلام')",[r]);await db.query("select public.review_order_return($1,true,'تم الاستلام')",[r]);expect((await db.query("select total::int from public.orders where id=$1",[id])).rows).toEqual([{total:48000}]);expect((await db.query("select quantity,returned_quantity,line_total::int from public.order_items where order_id=$1",[id])).rows).toEqual([{quantity:2,returned_quantity:1,line_total:48000}]);expect((await db.query("select sum(amount)::int paid from public.order_payments where order_id=$1",[id])).rows).toEqual([{paid:72000}]);await db.query("select public.record_payment($1,gen_random_uuid(),-10000,'cash','رد جزء من المستحق')",[id]);await db.query("select public.record_payment($1,gen_random_uuid(),-14000,'instapay','رد باقي المستحق')",[id]);await db.exec("reset role");expect((await db.query("select quantity_pieces::int from public.inventory where product_id=$1",[product])).rows).toEqual([{quantity_pieces:432}]);expect((await db.query("select id from public.stock_movements where product_id=$1 and source like 'مرتجع%'",[product])).rows).toHaveLength(1);});
 it("lets staff return the entire invoice and restores all pieces without double stock",async()=>{const id=await deliveredForReturn();const payload=JSON.stringify([{unit_id:unit,quantity:3}]);const key='90000000-0000-4000-8000-000000000001';await db.query("select public.create_admin_return($1,$2,$3,'مرتجع كامل')",[id,key,payload]);await db.query("select public.create_admin_return($1,$2,$3,'مرتجع كامل')",[id,key,payload]);expect((await db.query("select total::int,subtotal::int,delivery_fee::int from public.orders where id=$1",[id])).rows).toEqual([{total:0,subtotal:0,delivery_fee:0}]);await db.exec("reset role");expect((await db.query("select quantity_pieces::int from public.inventory where product_id=$1",[product])).rows).toEqual([{quantity_pieces:480}]);});
 it("rejects returning more than purchased",async()=>{const id=await deliveredForReturn();await expect(requestedReturn(id,4)).rejects.toThrow('INVALID_RETURN_QUANTITY');});
 it("keeps return details private to the owning customer",async()=>{const id=await deliveredForReturn();await requestedReturn(id);await asUser(ids.bob);expect((await db.query("select id from public.order_returns where order_id=$1",[id])).rows).toEqual([]);});
 it("never lets a customer approve their own return",async()=>{const id=await deliveredForReturn();const r=await requestedReturn(id);await expect(db.query("select public.review_order_return($1,true,'مزور')",[r])).rejects.toThrow('FORBIDDEN');});
 it("prevents overlapping pending returns",async()=>{const id=await deliveredForReturn();await requestedReturn(id);await expect(requestedReturn(id)).rejects.toThrow('RETURN_PENDING');});
 it("rejects an unfulfilled return before stock was delivered",async()=>{const id=await ordered(1);await expect(requestedReturn(id)).rejects.toThrow('RETURN_REQUIRES_DELIVERY');});
 it("rejects a return without touching quantity or money when staff decline it",async()=>{const id=await deliveredForReturn();const r=await requestedReturn(id);await asUser(ids.staff);await db.query("select public.review_order_return($1,false,'لم يتم استلام البضاعة')",[r]);expect((await db.query("select total::int from public.orders where id=$1",[id])).rows).toEqual([{total:72000}]);expect((await db.query("select quantity from public.order_items where order_id=$1",[id])).rows).toEqual([{quantity:3}]);});
 it("ignores forged return prices and uses the stored unit price",async()=>{const id=await deliveredForReturn();await asUser(ids.alice);const r=await db.query<{id:string}>("select public.request_order_return($1,gen_random_uuid(),$2,'سبب المرتجع') id",[id,JSON.stringify([{unit_id:unit,quantity:1,unit_price:999999999,amount:999999999}])]);expect((await db.query("select amount::int from public.order_returns where id=$1",[r.rows[0]!.id])).rows).toEqual([{amount:24000}]);});

 it("rolls back returned stock, invoice and approval if notification recording fails",async()=>{const id=await deliveredForReturn();const r=await requestedReturn(id);await db.exec("reset role; create function private.fail_return_notice() returns trigger language plpgsql as $$ begin raise exception 'NOTICE_FAILED'; end $$; create trigger fail_return_notice before insert on public.customer_notifications for each row execute function private.fail_return_notice();savepoint review_attempt");await asUser(ids.staff);await expect(db.query("select public.review_order_return($1,true,'استلام')",[r])).rejects.toThrow('NOTICE_FAILED');await db.exec("rollback to savepoint review_attempt;reset role");expect((await db.query("select quantity_pieces::int from public.inventory where product_id=$1",[product])).rows).toEqual([{quantity_pieces:408}]);expect((await db.query("select total::int from public.orders where id=$1",[id])).rows).toEqual([{total:72000}]);expect((await db.query("select status from public.order_returns where id=$1",[r])).rows).toEqual([{status:'REQUESTED'}]);});
 it("reduces a reservation, preserves agreed prices and notifies exactly once on retry",async()=>{
  const id=await ordered();await db.exec("reset role");await db.query("update public.product_units set price_piastres=99999 where id=$1",[unit]);await asUser(ids.staff);
  const change=await amend(id,2);await db.query("select public.amend_order($1,0,'80000000-0000-4000-8000-000000000001',$2,'نقص كمية بالمخزن',$3)",[id,change.list,JSON.stringify(change.preview)]);
  expect((await db.query("select quantity::int,unit_price::int,line_total::int from public.order_items where order_id=$1",[id])).rows).toEqual([{quantity:2,unit_price:24000,line_total:48000}]);
  await db.exec("reset role");
  expect((await db.query("select quantity_pieces::int,reserved_pieces::int from public.inventory where product_id=$1",[product])).rows).toEqual([{quantity_pieces:480,reserved_pieces:48}]);
  expect((await db.query("select total::int,revision::int,status from public.orders where id=$1",[id])).rows).toEqual([{total:48000,revision:1,status:'CONFIRMED'}]);
  await asUser(ids.alice);expect((await db.query("select id from public.customer_notifications")).rows).toHaveLength(1);expect((await db.query("select id from public.order_amendments")).rows).toHaveLength(1);
 });
 it("keeps delivery free when a reduction crosses the retired threshold",async()=>{
  const id=await ordered(9);await db.exec("reset role");await asUser(ids.owner);await db.query("select public.save_admin_settings((select revision from public.store_settings where id),1,48,'warn')");await asUser(ids.staff);await amend(id,8);
  expect((await db.query("select subtotal::int,delivery_fee::int,total::int from public.orders where id=$1",[id])).rows).toEqual([{subtotal:192000,delivery_fee:0,total:192000}]);
 });
 it("returns a changed ready order to confirmed for a new Bella review",async()=>{
  const id=await ordered();await db.query("select public.transition_order($1,0,'READY','بيلا')",[id]);await amend(id,2,1);
  expect((await db.query("select status,revision::int from public.orders where id=$1",[id])).rows).toEqual([{status:'CONFIRMED',revision:2}]);
 });
 it("allows increases only within free inventory and updates the combined reservation",async()=>{
  const id=await ordered();await amend(id,4);await db.exec("reset role");expect((await db.query("select reserved_pieces::int from public.inventory where product_id=$1",[product])).rows).toEqual([{reserved_pieces:96}]);
 });
 it("removes an unavailable line and releases only that product's reservation",async()=>{
  const otherUnit='30000000-0000-4000-8000-000000000002';const addr=await address();await asUser(ids.alice);const original=JSON.stringify([{unit_id:unit,quantity:1},{unit_id:otherUnit,quantity:1}]);
  const reviewed=(await db.query<{q:unknown}>("select public.quote_order($1,$2) q",[original,addr])).rows[0]!.q;
  const id=(await db.query<{id:string}>("select public.submit_order(gen_random_uuid(),$1,$2,'cash','',$3) id",[original,addr,JSON.stringify(reviewed)])).rows[0]!.id;await asUser(ids.staff);
  const changed=JSON.stringify([{unit_id:unit,quantity:1},{unit_id:otherUnit,quantity:0}]);const preview=(await db.query<{q:unknown}>("select public.preview_order_amendment($1,0,$2) q",[id,changed])).rows[0]!.q;
  await db.query("select public.amend_order($1,0,gen_random_uuid(),$2,'الصنف الآخر غير متاح',$3)",[id,changed,JSON.stringify(preview)]);
  expect((await db.query("select unit_id from public.order_items where order_id=$1",[id])).rows).toEqual([{unit_id:unit}]);
  await db.exec("reset role");
  expect((await db.query("select reserved_pieces::int from public.inventory where product_id='20000000-0000-4000-8000-000000000002'")).rows).toEqual([{reserved_pieces:0}]);
 });
 it("rejects an increase beyond stock",async()=>{const id=await ordered();await expect(amendment(id,21)).rejects.toThrow('INSUFFICIENT_STOCK');});
 it("rejects an empty order or an unchanged edit",async()=>{const id=await ordered();await expect(amendment(id,0)).rejects.toThrow('EMPTY_ORDER');});
 it("does not create revisions or notifications when quantities do not change",async()=>{const id=await ordered();await expect(amendment(id,3)).rejects.toThrow('NO_ORDER_CHANGES');});
 it("refuses a stale staff edit",async()=>{const id=await ordered();await amend(id,2);await expect(amendment(id,1,0)).rejects.toThrow('EDIT_CONFLICT');});
 it("rejects an amendment key reused with different changes",async()=>{const id=await ordered();const change=await amend(id,2);await expect(db.query("select public.amend_order($1,0,'80000000-0000-4000-8000-000000000001',$2,'نقص كمية بالمخزن',$3)",[id,JSON.stringify([{unit_id:unit,quantity:1}]),JSON.stringify(change.preview)])).rejects.toThrow('IDEMPOTENCY_CONFLICT');});
 it("requires a refund before reducing below collected money",async()=>{const id=await ordered();await db.query("select public.record_payment($1,gen_random_uuid(),70000,'cash','تحصيل جزئي')",[id]);await expect(amendment(id,2)).rejects.toThrow('AMENDMENT_REQUIRES_REFUND');});
 it("blocks direct edits and customer amendment attempts",async()=>{const id=await ordered();await asUser(ids.alice);await expect(amendment(id,2)).rejects.toThrow('FORBIDDEN');});
 it("keeps notifications private and supports idempotent read acknowledgement",async()=>{
  const id=await ordered();await amend(id,2);await asUser(ids.bob);expect((await db.query("select id from public.customer_notifications")).rows).toEqual([]);expect((await db.query("select id from public.order_amendments")).rows).toEqual([]);
  await asUser(ids.alice);expect((await db.query<{s:{unread:number}}>("select public.notification_summary() s")).rows[0]!.s.unread).toBe(1);
  const notice=(await db.query<{id:number}>("select id from public.customer_notifications")).rows[0]!.id;await db.query("select public.mark_notification_read($1)",[notice]);await db.query("select public.mark_notification_read($1)",[notice]);
  expect((await db.query<{s:{unread:number}}>("select public.notification_summary() s")).rows[0]!.s.unread).toBe(0);
 });
 it("cannot acknowledge another customer's notification",async()=>{const id=await ordered();await amend(id,2);await asUser(ids.alice);const notice=(await db.query<{id:number}>("select id from public.customer_notifications")).rows[0]!.id;await asUser(ids.bob);await expect(db.query("select public.mark_notification_read($1)",[notice])).rejects.toThrow('NOTIFICATION_UNAVAILABLE');});
 it("rolls the amendment and reservation back if notification creation fails",async()=>{
  const id=await ordered();const change=await amendment(id,2);await db.exec("reset role");await db.exec("create function private.fail_notification() returns trigger language plpgsql as $$ begin raise exception 'NOTIFY_FAILED'; end $$; create trigger test_fail_notice before insert on public.customer_notifications for each row execute function private.fail_notification();");await asUser(ids.staff);
  await db.exec('savepoint atomic_edit');await expect(db.query("select public.amend_order($1,0,gen_random_uuid(),$2,'نقص كمية بالمخزن',$3)",[id,change.list,JSON.stringify(change.preview)])).rejects.toThrow('NOTIFY_FAILED');await db.exec('rollback to savepoint atomic_edit');
  expect((await db.query("select quantity::int from public.order_items where order_id=$1",[id])).rows).toEqual([{quantity:3}]);await db.exec("reset role");expect((await db.query("select reserved_pieces::int from public.inventory where product_id=$1",[product])).rows).toEqual([{reserved_pieces:72}]);expect((await db.query("select id from public.order_amendments where order_id=$1",[id])).rows).toEqual([]);
 });
 it("collects just the outstanding balance at completion",async()=>{
  const {id}=await submit();await asUser(ids.staff);await db.query("select public.record_payment($1,gen_random_uuid(),10000,'cash','دفعة')",[id]);await db.query("select public.transition_order($1,0,'READY','بيلا')",[id]);await db.query("select public.complete_order($1,1,gen_random_uuid(),'instapay','استلام الباقي',14000)",[id]);
  expect((await db.query("select amount::int from public.order_payments where order_id=$1 order by amount",[id])).rows).toEqual([{amount:10000},{amount:14000}]);
 });
 it("requires full collection even when the transition RPC is called directly",async()=>{const {id}=await submit();await asUser(ids.staff);await db.query("select public.transition_order($1,0,'READY','بيلا')",[id]);await expect(db.query("select public.transition_order($1,1,'DELIVERED','')",[id])).rejects.toThrow('PAYMENT_REQUIRED');});
 it("rolls collection back if the stock movement cannot be committed",async()=>{
  const {id}=await submit();await asUser(ids.staff);await db.query("select public.transition_order($1,0,'READY','بيلا')",[id]);await db.exec("reset role");
  await db.exec("create function private.fail_delivery() returns trigger language plpgsql as $$ begin raise exception 'DELIVERY_FAILED'; end $$; create trigger test_fail_delivery before insert on public.stock_movements for each row execute function private.fail_delivery();");await asUser(ids.staff);await db.exec('savepoint atomic_completion');
  await expect(db.query("select public.complete_order($1,1,gen_random_uuid(),'cash','تحصيل',24000)",[id])).rejects.toThrow('DELIVERY_FAILED');await db.exec('rollback to savepoint atomic_completion');
  expect((await db.query("select amount from public.order_payments where order_id=$1",[id])).rows).toEqual([]);expect((await db.query("select status from public.orders where id=$1",[id])).rows).toEqual([{status:'READY'}]);
 });
 it("refuses amendments after completion",async()=>{const {id}=await submit();await asUser(ids.staff);await db.query("select public.transition_order($1,0,'READY','بيلا')",[id]);await db.query("select public.complete_order($1,1,gen_random_uuid(),'cash','تحصيل',24000)",[id]);await expect(amendment(id,2,2)).rejects.toThrow('ORDER_NOT_EDITABLE');});
 it("rejects a changed outstanding balance instead of collecting from a stale screen",async()=>{const {id}=await submit();await asUser(ids.staff);await db.query("select public.transition_order($1,0,'READY','بيلا')",[id]);await db.query("select public.record_payment($1,gen_random_uuid(),10000,'cash','دفعة')",[id]);await expect(db.query("select public.complete_order($1,1,gen_random_uuid(),'cash','باقي',24000)",[id])).rejects.toThrow('EDIT_CONFLICT');});
 it("reserves stock at submission, snapshots totals and charges the zone fee",async()=>{
 const {id,q}=await submit();expect(q.total).toBe(24000);
 await db.exec("reset role");expect((await db.query("select quantity_pieces::int,reserved_pieces::int,version::int from public.inventory where product_id=$1",[product])).rows).toEqual([{quantity_pieces:480,reserved_pieces:24,version:2}]);
 expect((await db.query("select product_name,unit_price::int from public.order_items where order_id=$1",[id])).rows[0]).toMatchObject({unit_price:24000});
 });
 it("returns the same order on retry without reserving stock twice",async()=>{
 const {id,addr,q}=await submit();const retry=await db.query("select public.submit_order($1,$2,$3,'cash','',$4) id",[request,JSON.stringify(items),addr,JSON.stringify(q)]);expect(retry.rows).toEqual([{id}]);
 await db.exec("reset role");expect((await db.query("select reserved_pieces::int from public.inventory where product_id=$1",[product])).rows).toEqual([{reserved_pieces:24}]);
 });
 it("rejects a reused request key with a different payload",async()=>{const {addr,q}=await submit();await expect(db.query("select public.submit_order($1,$2,$3,'instapay','',$4)",[request,JSON.stringify(items),addr,JSON.stringify(q)])).rejects.toThrow("IDEMPOTENCY_CONFLICT");});
 it("protects checkout when the price changes after review",async()=>{const {addr,q}=await quote();await db.exec("reset role");await db.query("update public.product_units set price_piastres=25000 where id=$1",[unit]);await asUser(ids.alice);await expect(db.query("select public.submit_order($1,$2,$3,'cash','',$4)",[request,JSON.stringify(items),addr,JSON.stringify(q)])).rejects.toThrow("QUOTE_CHANGED");});
 it("uses strictly greater than the free-delivery threshold",async()=>{
 await db.query("update public.product_units set price_piastres=20000 where id=$1",[unit]);const equal=await quote(10);expect(equal.q.delivery_fee).toBe(0);const above=await quote(11);expect(above.q.delivery_fee).toBe(0);
 });
 it("rejects quantities exceeding available stock",async()=>{await expect(quote(21)).rejects.toThrow("INSUFFICIENT_STOCK");});
 it("rejects another customer's address",async()=>{const other=await address(ids.bob);await asUser(ids.alice);await expect(db.query("select public.quote_order($1,$2)",[JSON.stringify(items),other])).rejects.toThrow("INVALID_ADDRESS");});
 it("combines stock requirements of different units of the same product",async()=>{
 const second="30000000-0000-4000-8000-000000000099";await db.query("insert into public.product_units(id,product_id,name,pieces_per_unit,price_piastres) values($1,$2,'صندوق اختبار',12,12000)",[second,product]);const addr=await address();await asUser(ids.alice);
 await expect(db.query("select public.quote_order($1,$2)",[JSON.stringify([{unit_id:unit,quantity:10},{unit_id:second,quantity:30}]),addr])).rejects.toThrow("INSUFFICIENT_STOCK");
 });
 it("chooses the lowest eligible price without stacking and excludes expired rules",async()=>{
 await db.query("insert into public.pricing_rules(name,kind,value,starts_at,ends_at) values('خصم عام','percent',2000,now()-interval '1 day',now()+interval '1 day'),('عرض منتهي','fixed',1,now()-interval '2 days',now()-interval '1 day')");
 await db.query("insert into public.pricing_rules(name,kind,value,customer_id,minimum_quantity,starts_at,ends_at) values('سعر عميل','fixed',19000,$1,5,now()-interval '1 day',now()+interval '1 day')",[ids.alice]);
 const small=await quote(1);expect(small.q.subtotal).toBe(19200);const tier=await quote(5);expect(tier.q.subtotal).toBe(95000);
 await db.exec("reset role");const bobAddress=await address(ids.bob);await asUser(ids.bob);expect((await db.query<{q:{subtotal:number}}>("select public.quote_order($1,$2) q",[JSON.stringify([{unit_id:unit,quantity:5}]),bobAddress])).rows[0]!.q.subtotal).toBe(96000);
 });
 it("rounds percentage discounts to the nearest piastre before multiplying",async()=>{
 await db.query("update public.product_units set price_piastres=101 where id=$1",[unit]);await db.query("insert into public.pricing_rules(name,kind,value,starts_at,ends_at) values('نصف السعر','percent',5000,now()-interval '1 day',now()+interval '1 day')");expect((await quote(2)).q.subtotal).toBe(102);
 });
 it("isolates order headers, items and events from other customers",async()=>{await submit();await asUser(ids.bob);for(const table of ['orders','order_items','order_events','order_payments'])expect((await db.query(`select * from public.${table}`)).rows).toHaveLength(0);});
 it("allows customers to cancel new orders and releases the reservation",async()=>{const {id}=await submit();await db.query("select public.transition_order($1,0,'CANCELLED','تغيير الطلب')",[id]);await db.exec("reset role");expect((await db.query("select quantity_pieces::int,reserved_pieces::int from public.inventory where product_id=$1",[product])).rows).toEqual([{quantity_pieces:480,reserved_pieces:0}]);});
 it("rejects skipping fulfillment states",async()=>{const {id}=await submit();await asUser(ids.staff);await expect(db.query("select public.transition_order($1,0,'DELIVERED','')",[id])).rejects.toThrow("INVALID_TRANSITION");});
 it("starts confirmed and completes stock and collection atomically through the three-state workflow",async()=>{
 const {id}=await submit();expect((await db.query("select status from public.orders where id=$1",[id])).rows).toEqual([{status:'CONFIRMED'}]);await asUser(ids.staff);await db.query("select public.transition_order($1,0,'READY','تم التسجيل على بيلا')",[id]);
 await db.query("select public.complete_order($1,1,$2,'cash','استلام كامل',24000)",[id,request]);await db.query("select public.complete_order($1,1,$2,'cash','استلام كامل',24000)",[id,request]);
 await db.exec("reset role");expect((await db.query("select quantity_pieces::int,reserved_pieces::int from public.inventory where product_id=$1",[product])).rows).toEqual([{quantity_pieces:456,reserved_pieces:0}]);expect((await db.query("select amount::int from public.order_payments where order_id=$1",[id])).rows).toEqual([{amount:24000}]);
 });
 it("records payments idempotently and supports explicit refunds",async()=>{
 const {id}=await submit();await asUser(ids.staff);await db.query("select public.record_payment($1,$2,10000,'cash','استلام')",[id,request]);await db.query("select public.record_payment($1,$2,10000,'cash','استلام')",[id,request]);
 expect((await db.query("select amount::int from public.order_payments where order_id=$1",[id])).rows).toEqual([{amount:10000}]);await db.query("select public.record_payment($1,gen_random_uuid(),-10000,'cash','رد المبلغ')",[id]);await db.query("select public.transition_order($1,0,'CANCELLED','إلغاء ورد المبلغ')",[id]);
 });
 it("refuses cancellation while collected funds have not been refunded",async()=>{const {id}=await submit();await asUser(ids.staff);await db.query("select public.record_payment($1,$2,10000,'cash','استلام')",[id,request]);await expect(db.query("select public.transition_order($1,0,'CANCELLED','إلغاء الطلب')",[id])).rejects.toThrow("PAYMENT_REQUIRES_REFUND");});
 it("prevents customer payment confirmation",async()=>{const {id}=await submit();await expect(db.query("select public.record_payment($1,$2,10000,'cash','مزور')",[id,request])).rejects.toThrow("FORBIDDEN");});
 it("prevents direct order snapshot edits",async()=>{await submit();await asUser(ids.owner);await expect(db.query("update public.order_items set unit_price=1")).rejects.toThrow(/permission denied/i);});
 it("aggregates stable identities after name changes and uses Cairo report boundaries",async()=>{
 const first=await submit();await db.exec("reset role");await db.query("update public.products set name='اسم منتج جديد' where id=$1",[product]);await db.query("update public.profiles set full_name='اسم عميل جديد' where id=$1",[ids.alice]);const review=await quote();const second=(await db.query<{id:string}>("select public.submit_order(gen_random_uuid(),$1,$2,'cash','',$3) id",[JSON.stringify(items),review.addr,JSON.stringify(review.q)])).rows[0]!.id;
 await asUser(ids.staff);for(const id of [first.id,second]){await db.query("select public.transition_order($1,0,'READY','بيلا')",[id]);if(id===second)await db.query("select public.record_payment($1,gen_random_uuid(),10000,'cash','تحصيل')",[id]);await db.query("select public.complete_order($1,1,gen_random_uuid(),'cash','تحصيل الإتمام',$2)",[id,id===second?14000:24000]);}
 await db.exec("reset role");await db.query("update public.orders set created_at='2026-10-26 12:00 Africa/Cairo',delivered_at='2026-10-26 12:00 Africa/Cairo'");await db.query("update public.order_payments set created_at='2026-10-27 00:00 Africa/Cairo'");await asUser(ids.manager);
 const before=(await db.query<{r:{products:unknown[];customers:{count:number}[];delivered_sales:number;collected:number}}>("select public.sales_report('2026-10-26','2026-10-26') r")).rows[0]!.r;expect(before.products).toHaveLength(1);expect(before.customers).toHaveLength(1);expect(before.customers[0]!.count).toBe(2);expect(before.delivered_sales).toBe(48000);expect(before.collected).toBe(0);
 await db.exec("reset role");await db.query("update public.order_payments set created_at='2026-10-26 23:59:59 Africa/Cairo' where reference='تحصيل'");await asUser(ids.manager);expect((await db.query<{r:{collected:number}}>("select public.sales_report('2026-10-26','2026-10-26') r")).rows[0]!.r.collected).toBe(10000);
 });
});

describe("operations, imports and reporting",()=>{
 const unit="30000000-0000-4000-8000-000000000001";
 it("revokes previous session access immediately during account recovery",async()=>{
 await db.exec("set local role service_role");await db.query("select public.complete_account_recovery($1,$2,'تحقق من ملكية المحل',null)",[ids.owner,ids.alice]);await asUser(ids.alice);
 expect((await db.query("select private.is_active_customer() allowed")).rows).toEqual([{allowed:false}]);expect((await db.query("select * from public.profiles")).rows).toHaveLength(0);
 });
 it("prevents a manager from assigning roles",async()=>{await asUser(ids.manager);await expect(db.query("select public.manage_staff($1,'OWNER',true)",[ids.alice])).rejects.toThrow("FORBIDDEN");});
 it("lets owners change and disable existing staff roles and invalidates their sessions",async()=>{await asUser(ids.owner);await db.query("select public.manage_staff($1,'MANAGER',true)",[ids.viewer]);await db.exec("reset role");await db.query("insert into auth.sessions(id,user_id) values($1,$1) on conflict do nothing",[ids.viewer]);await asUser(ids.viewer);expect((await db.query("select private.has_permission('catalog.write') allowed")).rows).toEqual([{allowed:true}]);await asUser(ids.owner);await db.query("select public.manage_staff($1,'MANAGER',false)",[ids.viewer]);await asUser(ids.viewer);expect((await db.query("select private.has_permission('catalog.write') allowed")).rows).toEqual([{allowed:false}]);});
 it("protects the current owner from accidental self-demotion",async()=>{await asUser(ids.owner);await expect(db.query("select public.manage_staff($1,'VIEWER',true)",[ids.owner])).rejects.toThrow("CANNOT_EDIT_SELF");});
 it("requires matching read permission before granting write permission",async()=>{await asUser(ids.owner);await expect(db.query("select public.save_role_permissions('MANAGER',array['catalog.write'])")).rejects.toThrow("INVALID_PERMISSIONS");});
 it("never allows staff.manage to be granted to a non-owner role",async()=>{await asUser(ids.owner);await expect(db.query("select public.save_role_permissions('VIEWER',array['staff.manage'])")).rejects.toThrow("INVALID_PERMISSIONS");});
 it("keeps the viewer role read-only even when its permissions are edited",async()=>{await asUser(ids.owner);await expect(db.query("select public.save_role_permissions('VIEWER',array['catalog.read','catalog.write'])")).rejects.toThrow("INVALID_PERMISSIONS");});
 it("keeps protected price changes outside the order-staff role",async()=>{await asUser(ids.owner);await expect(db.query("select public.save_role_permissions('ORDER_STAFF',array['catalog.read','catalog.write'])")).rejects.toThrow("INVALID_PERMISSIONS");});
 it("prevents direct phone and password-recovery RPCs by customers",async()=>{await asUser(ids.alice);await expect(db.query("select public.complete_account_recovery($1,$2,'سبب مزور',null)",[ids.owner,ids.bob])).rejects.toThrow(/permission denied/i);});
 it("previews imports without mutations and applies each batch once",async()=>{
 const rows=[{sku:"DEMO-DRINK",product_id:product,unit_id:unit,quantity:30,version:1}];await asUser(ids.manager);const batch=(await db.query<{id:string}>("select public.preview_import('stock',$1) id",[JSON.stringify(rows)])).rows[0]!.id;
 expect((await db.query("select quantity_pieces::int from public.inventory where product_id=$1",[product])).rows).toEqual([{quantity_pieces:480}]);await db.query("select public.apply_import($1)",[batch]);await db.query("select public.apply_import($1)",[batch]);
 expect((await db.query("select quantity_pieces::int,version::int from public.inventory where product_id=$1",[product])).rows).toEqual([{quantity_pieces:720,version:2}]);expect((await db.query("select * from public.stock_movements where source like 'استيراد Excel%'")).rows).toHaveLength(1);
 });
 it("rolls the entire import back when a later row is invalid",async()=>{
 const rows=[{sku:"A",product_id:product,unit_id:unit,quantity:30,version:1},{sku:"Z",product_id:product,unit_id:unit,quantity:40,version:1}];await asUser(ids.manager);const batch=(await db.query<{id:string}>("select public.preview_import('stock',$1) id",[JSON.stringify(rows)])).rows[0]!.id;
 await db.exec("savepoint attempt");await expect(db.query("select public.apply_import($1)",[batch])).rejects.toThrow("STOCK_VERSION_CONFLICT");await db.exec("rollback to savepoint attempt");expect((await db.query("select quantity_pieces::int,version::int from public.inventory where product_id=$1",[product])).rows).toEqual([{quantity_pieces:480,version:1}]);
 });
 it("prevents another staff member from applying a private preview",async()=>{await asUser(ids.manager);const batch=(await db.query<{id:string}>("select public.preview_import('stock',$1) id",[JSON.stringify([{sku:"DEMO-DRINK",product_id:product,unit_id:unit,quantity:30,version:1}])])).rows[0]!.id;await asUser(ids.owner);await expect(db.query("select public.apply_import($1)",[batch])).rejects.toThrow("IMPORT_UNAVAILABLE");});
 it("produces genuine zero reports on an empty order database",async()=>{await asUser(ids.manager);const report=(await db.query<{r:{order_count:number;delivered_sales:number;collected:number}}>("select public.sales_report('2026-10-01','2026-10-31') r")).rows[0]!.r;expect(report).toMatchObject({order_count:0,delivered_sales:0,collected:0});});
 it("refuses unauthorized reports and excessive date spans",async()=>{await asUser(ids.viewer);await expect(db.query("select public.sales_report('2026-10-01','2026-10-31')")).rejects.toThrow("FORBIDDEN");});
 it("rejects reports spanning more than a year",async()=>{await asUser(ids.owner);await expect(db.query("select public.sales_report('2020-01-01','2026-01-01')")).rejects.toThrow("INVALID_DATE_RANGE");});
 it("does not expose customer-only prices in the public catalogue",async()=>{await db.query("insert into public.pricing_rules(name,customer_id,kind,value,starts_at,ends_at) values('خاص',$1,'fixed',1,now()-interval '1 day',now()+interval '1 day')",[ids.alice]);await db.exec("set local role anon");expect((await db.query("select price_piastres::int from public.browse_catalog('DEMO-DRINK')")).rows).toEqual([{price_piastres:24000}]);});
 it("shows applicable public promotions without stacking discounts",async()=>{await db.query("insert into public.pricing_rules(name,kind,value,starts_at,ends_at) values('عام','percent',1000,now()-interval '1 day',now()+interval '1 day')");await db.exec("set local role anon");expect((await db.query("select price_piastres::int,base_price_piastres::int from public.browse_catalog('DEMO-DRINK')")).rows).toEqual([{price_piastres:21600,base_price_piastres:24000}]);});
});

describe("separate staff accounts",()=>{
 it("ignores privileged account metadata during public registration",async()=>{
  const id="40000000-0000-4000-8000-000000000099";
  await db.query("insert into auth.users(id,phone,raw_user_meta_data) values($1,'201099999999', $2)",[id,JSON.stringify({account_kind:"STAFF",role:"OWNER",full_name:"محاولة ترقية"})]);
  expect((await db.query("select account_kind from public.profiles where id=$1",[id])).rows).toEqual([{account_kind:"CUSTOMER"}]);
  expect((await db.query("select * from public.staff_assignments where user_id=$1",[id])).rows).toEqual([]);
 });
 it("refuses promoting a customer through the staff RPC",async()=>{await asUser(ids.owner);await expect(db.query("select public.manage_staff($1,'OWNER',true)",[ids.alice])).rejects.toThrow("STAFF_ONLY");});
 it("keeps provision RPC inaccessible even to an owner JWT",async()=>{await asUser(ids.owner);await expect(db.query("select public.provision_staff($1,$2,'اسم موظف','OWNER')",[ids.owner,ids.alice])).rejects.toThrow(/permission denied/i);});
 it("provisions a fresh staff identity without shop fields",async()=>{
  const id="40000000-0000-4000-8000-000000000099";await db.query("insert into auth.users(id,phone) values($1,'201099999999')",[id]);
  await db.exec("set local role service_role");await db.query("select public.provision_staff($1,$2,'موظف جديد','ORDER_STAFF')",[ids.owner,id]);await db.exec("reset role");
  expect((await db.query("select account_kind,shop_name,area from public.profiles where id=$1",[id])).rows).toEqual([{account_kind:"STAFF",shop_name:"",area:""}]);
  expect((await db.query("select role from public.staff_assignments where user_id=$1",[id])).rows).toEqual([{role:"ORDER_STAFF"}]);
 });
 it("does not provision an existing customer with orders or shop details",async()=>{await db.query("update public.profiles set shop_name='محل قائم' where id=$1",[ids.alice]);await db.exec("set local role service_role");await expect(db.query("select public.provision_staff($1,$2,'ترقية ممنوعة','OWNER')",[ids.owner,ids.alice])).rejects.toThrow("NOT_NEW_STAFF_ACCOUNT");});
 it("keeps staff out of customer-only shopping and addresses",async()=>{await asUser(ids.staff);expect((await db.query("select private.is_active_customer() ok")).rows).toEqual([{ok:false}]);await expect(db.query("select public.save_customer_address(null,$1,'عنوان موظف غير مقبول','',true)",[zone])).rejects.toThrow("FORBIDDEN");});
 it("hides staff from customer suggestions",async()=>{await asUser(ids.owner);const rows=await db.query<{id:string}>("select id from public.search_suggestions('customers','عميل')");expect(rows.rows.every(r=>[ids.alice,ids.bob].includes(r.id))).toBe(true);});
 it("does not let a disabled staff JWT fall back to a customer session",async()=>{await asUser(ids.owner);await db.query("select public.manage_staff($1,'VIEWER',false)",[ids.viewer]);await asUser(ids.viewer);expect((await db.query("select private.is_active_account() ok,private.is_active_customer() customer,public.get_staff_access() access")).rows).toEqual([{ok:false,customer:false,access:null}]);});
 it("blocks direct staff account-type writes",async()=>{await asUser(ids.staff);await expect(db.query("update public.profiles set account_kind='CUSTOMER' where id=$1",[ids.staff])).rejects.toThrow(/permission denied/i);});
 it("allows only the owner to edit another account profile",async()=>{await asUser(ids.manager);await expect(db.query("select public.save_managed_profile($1,$2)",[ids.alice,JSON.stringify({full_name:"تغيير غير مصرح"})])).rejects.toThrow("FORBIDDEN");});
 it("allows changing a staff name but rejects role mass assignment",async()=>{await asUser(ids.owner);await db.query("select public.save_managed_profile($1,$2)",[ids.staff,JSON.stringify({full_name:"اسم موظف محدث"})]);expect((await db.query("select full_name from public.profiles where id=$1",[ids.staff])).rows).toEqual([{full_name:"اسم موظف محدث"}]);await expect(db.query("select public.save_managed_profile($1,$2)",[ids.staff,JSON.stringify({full_name:"اسم جديد",account_kind:"CUSTOMER"})])).rejects.toThrow("INVALID_PROFILE");});
 it("blocks direct credential completion for a customer JWT",async()=>{await asUser(ids.alice);await expect(db.query("select public.finish_own_credentials($1,null)",[ids.bob])).rejects.toThrow(/permission denied/i);});
});

describe("administrative MFA enforcement",()=>{
 it("keeps enrollment identity readable while denying privileged SQL at aal1",async()=>{await db.exec("update private.deployment_security set admin_mfa_required=true");await asUser(ids.owner);expect((await db.query("select private.has_permission('staff.manage') ok")).rows).toEqual([{ok:false}]);expect((await db.query<{a:{mfa_required:boolean;mfa_verified:boolean}}>("select public.get_staff_access() a")).rows[0]!.a).toMatchObject({mfa_required:true,mfa_verified:false});expect((await db.query("select id from public.profiles")).rows).toEqual([{id:ids.owner}]);await expect(db.query("select public.manage_staff($1,'VIEWER',false)",[ids.viewer])).rejects.toThrow('FORBIDDEN');});
 it("accepts aal2 only with a live administrative session",async()=>{await db.exec("update private.deployment_security set admin_mfa_required=true");await asUser(ids.owner);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({session_id:ids.owner,aal:'aal2'})]);expect((await db.query("select private.has_permission('staff.manage') ok")).rows).toEqual([{ok:true}]);await db.exec("reset role");await db.query("delete from auth.sessions where user_id=$1",[ids.owner]);await asUser(ids.owner);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({session_id:ids.owner,aal:'aal2'})]);expect((await db.query("select private.has_permission('staff.manage') ok")).rows).toEqual([{ok:false}]);});
 it("never lets a customer with aal2 acquire staff privileges or edit the policy",async()=>{await db.exec("update private.deployment_security set admin_mfa_required=true");await asUser(ids.alice);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({session_id:ids.alice,aal:'aal2'})]);expect((await db.query("select private.has_permission('staff.manage') ok")).rows).toEqual([{ok:false}]);await expect(db.exec("update private.deployment_security set admin_mfa_required=false")).rejects.toThrow(/permission denied/i);});
});

describe("production security readiness",()=>{
 it("keeps the readiness RPC private to the deployment service",async()=>{await asUser(ids.owner);await expect(db.query("select public.deployment_security_status()")).rejects.toThrow(/permission denied/i);});
 it("detects an unenrolled staff account even when the MFA enforcement switch is enabled",async()=>{await db.exec("update private.deployment_security set admin_mfa_required=true; update auth.users set email_confirmed_at=now(); insert into auth.mfa_factors(user_id,factor_type,status) select user_id,'totp','verified' from public.staff_assignments where user_id<>'40000000-0000-4000-8000-000000000006'; set local role service_role");const r=await db.query<{s:{admin_mfa_required:boolean;active_staff:number;pending_mfa_staff:number}}>("select public.deployment_security_status() s");expect(r.rows[0]!.s).toEqual({admin_mfa_required:true,staff_email_login_required:false,active_staff:4,pending_mfa_staff:1});});
});


describe("verified staff email boundary",()=>{
 it("prevents public metadata and customer updates from assigning a staff email",async()=>{await asUser(ids.alice);await expect(db.query("update public.profiles set login_email='forged@example.test',legacy_staff_login=true where id=$1",[ids.alice])).rejects.toThrow(/permission denied/i);});
 it("requires verified email for a freshly provisioned email-only staff identity",async()=>{
  const id="40000000-0000-4000-8000-000000000098";
  await db.query("insert into auth.users(id,email) values($1,'fresh@example.test')",[id]);
  await db.exec("set local role service_role");await db.query("select public.provision_email_staff($1,$2,'موظف جديد','ORDER_STAFF',null)",[ids.owner,id]);await db.exec("reset role");
  await db.query("insert into auth.sessions(id,user_id) values($1,$1)",[id]);await asUser(id);
  expect((await db.query("select private.has_permission('orders.write') ok")).rows).toEqual([{ok:false}]);
  expect((await db.query<{a:{email_required:boolean;email_ready:boolean}}>("select public.get_staff_access() a")).rows[0]!.a).toMatchObject({email_required:true,email_ready:false});
  await db.exec("reset role");await db.query("update auth.users set email_confirmed_at=now() where id=$1",[id]);await asUser(id);
  expect((await db.query("select private.has_permission('orders.write') ok")).rows).toEqual([{ok:true}]);
 });
 it("does not trust a profile email when the Auth email is unconfirmed or different",async()=>{
  await db.query("update public.profiles set legacy_staff_login=false,login_email='pending@example.test' where id=$1",[ids.owner]);await asUser(ids.owner);
  expect((await db.query("select private.has_permission('staff.manage') ok")).rows).toEqual([{ok:false}]);
 });
 it("production email enforcement removes the legacy password-only grace",async()=>{
  await db.exec("update private.deployment_security set staff_email_login_required=true");await db.query("update auth.users set email_confirmed_at=null where id=$1",[ids.owner]);await asUser(ids.owner);
  expect((await db.query("select private.has_permission('staff.manage') ok")).rows).toEqual([{ok:false}]);
 });
 it("restricts provisioning and email completion to server-side service operations",async()=>{await asUser(ids.owner);await expect(db.query("select public.finish_staff_email_link($1)",[ids.owner])).rejects.toThrow(/permission denied/i);});
 it("revokes all pre-verification sessions when the verified email is adopted",async()=>{
  await db.exec("set local role service_role");await db.query("select public.finish_staff_email_link($1)",[ids.owner]);await db.exec("reset role");expect((await db.query("select legacy_staff_login from public.profiles where id=$1",[ids.owner])).rows).toEqual([{legacy_staff_login:false}]);expect((await db.query("select * from auth.sessions where user_id=$1",[ids.owner])).rows).toEqual([]);
 });
});


describe("enrolled MFA without rollout downgrade",()=>{
 it("enforces an enrolled staff factor even before the global rollout switch",async()=>{await db.query("insert into auth.mfa_factors(user_id,factor_type,status) values($1,'totp','verified')",[ids.owner]);await asUser(ids.owner);expect((await db.query("select private.has_permission('staff.manage') ok")).rows).toEqual([{ok:false}]);expect((await db.query<{a:{mfa_required:boolean}}>("select public.get_staff_access() a")).rows[0]!.a.mfa_required).toBe(true);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({session_id:ids.owner,aal:'aal2'})]);expect((await db.query("select private.has_permission('staff.manage') ok")).rows).toEqual([{ok:true}]);});
 it("does not accept an unverified factor as completed enrollment",async()=>{await db.query("insert into auth.mfa_factors(user_id,factor_type,status) values($1,'totp','unverified')",[ids.owner]);await asUser(ids.owner);expect((await db.query("select private.has_permission('staff.manage') ok")).rows).toEqual([{ok:true}]);});
});

describe("028 historical data preservation",()=>{
 it("preserves existing invoices, payments and retired stock history during upgrade",async()=>{
  await asUser(ids.alice);const address=(await db.query<{id:string}>('select id from public.customer_addresses limit 1')).rows[0]!.id,items=JSON.stringify([{unit_id:'30000000-0000-4000-8000-000000000001',quantity:2}]);const quote=(await db.query<{q:unknown}>('select public.quote_order($1,$2) q',[items,address])).rows[0]!.q;const id=(await db.query<{id:string}>("select public.submit_order(gen_random_uuid(),$1,$2,'cash','',$3) id",[items,address,JSON.stringify(quote)])).rows[0]!.id;await asUser(ids.owner);await db.query("select public.record_payment($1,gen_random_uuid(),10000,'cash','تحصيل قبل الترحيل')",[id]);await db.exec('reset role');
  async function snapshot(){const rows=[];for(const name of ['orders','order_items','order_payments','inventory','stock_movements'])rows.push((await db.query('select to_jsonb(t) value from public.'+name+' t order by to_jsonb(t)::text')).rows);return rows;}
  const before=await snapshot();for(const name of ['202610310028_manual_product_availability.sql','202610310029_partial_phone_search.sql','202610310030_manual_availability_cleanup.sql'])await db.exec((await readFile('supabase/migrations/'+name,'utf8')).replace(/^begin;/,'').replace(/commit;\s*$/,''));expect(await snapshot()).toEqual(before);
 });
});

// Earlier suites deliberately verify the pre-upgrade schema (001–027).
// This suite applies the real upgrade inside each isolated transaction and
// exercises the current manual-availability behavior, including old records.
describe("manual availability upgrade 028",()=>{
 const unit="30000000-0000-4000-8000-000000000001";
 beforeEach(async()=>{await asUser(ids.owner);await db.exec('reset role');await db.exec((await readFile("supabase/migrations/202610310028_manual_product_availability.sql","utf8")).replace(/^begin;/,'').replace(/commit;\s*$/,''));for(const file of ['202610310029_partial_phone_search.sql','202610310030_manual_availability_cleanup.sql'])await db.exec((await readFile('supabase/migrations/'+file,'utf8')).replace(/^begin;/,'').replace(/commit;\s*$/,''));await db.exec("update public.inventory set quantity_pieces=0,reserved_pieces=0,stock_updated_at='2000-01-01'; update public.products set available=true;");});
 async function place(quantity=2){await asUser(ids.alice);const address=(await db.query<{id:string}>("select id from public.customer_addresses where customer_id=$1 limit 1",[ids.alice])).rows[0]!.id;const items=JSON.stringify([{unit_id:unit,quantity}]);const quote=(await db.query<{q:unknown}>("select public.quote_order($1,$2) q",[items,address])).rows[0]!.q;const id=(await db.query<{id:string}>("select public.submit_order(gen_random_uuid(),$1,$2,'cash','',$3) id",[items,address,JSON.stringify(quote)])).rows[0]!.id;return{id,items,address,quote};}
 async function stock(){await db.exec('reset role');return {inventory:(await db.query("select * from public.inventory order by product_id")).rows,movements:(await db.query("select * from public.stock_movements order by id")).rows};}
 it("allows ordering an available product with zero historical stock and an old stock date",async()=>{const before=await stock();const order=await place(100);expect(order.id).toBeTruthy();expect(await stock()).toEqual(before);});
 it("uses the same availability in all catalogue orders and available-only filters",async()=>{await db.exec('set local role anon');for(const sort of ['offers','sku','name'])expect((await db.query("select available from public.browse_catalog('DEMO-DRINK',null,25,null,$1,true)",[sort])).rows).toEqual([{available:true}]);});
 it("does not create an inventory ledger for newly added products",async()=>{await asUser(ids.owner);const p=(await db.query<{id:string}>("select public.save_product_with_availability(null,0,'MANUAL-NEW','منتج جديد',$1,'',true,true) id",['10000000-0000-4000-8000-000000000001'])).rows[0]!.id;await db.exec('reset role');expect((await db.query('select * from public.inventory where product_id=$1',[p])).rows).toEqual([]);});
 it("rejects unavailable products on direct quote calls",async()=>{await db.query('update public.products set available=false where id=$1',[product]);await expect(place()).rejects.toThrow('PRODUCT_UNAVAILABLE');});
 it("allows an editor to toggle availability with optimistic concurrency",async()=>{await asUser(ids.owner);const revision=(await db.query<{revision:number}>('select revision::int from public.products where id=$1',[product])).rows[0]!.revision;await db.query('select public.save_product_availability($1,$2,false)',[product,revision]);expect((await db.query('select available from public.products where id=$1',[product])).rows).toEqual([{available:false}]);await expect(db.query('select public.save_product_availability($1,$2,true)',[product,revision])).rejects.toThrow('EDIT_CONFLICT');});
 it("blocks customers from changing availability",async()=>{await asUser(ids.alice);await expect(db.query('select public.save_product_availability($1,0,false)',[product])).rejects.toThrow('FORBIDDEN');});
 it("blocks viewers from changing availability",async()=>{await asUser(ids.viewer);await expect(db.query('select public.save_product_availability($1,0,false)',[product])).rejects.toThrow('FORBIDDEN');});
 it("still validates invalid order quantities",async()=>{await expect(place(0)).rejects.toThrow('INVALID_QUANTITY');});
 it("still rejects client price tampering",async()=>{const o=await place();await expect(db.query("select public.submit_order(gen_random_uuid(),$1,$2,'cash','',$3)",[o.items,o.address,JSON.stringify({...o.quote as object,total:0})])).rejects.toThrow('QUOTE_CHANGED');});
 it("cancels a customer order without changing historical inventory",async()=>{const before=await stock();const o=await place();await db.query('select public.cancel_customer_order($1,0)',[o.id]);await db.query('select public.cancel_customer_order($1,0)',[o.id]);expect(await stock()).toEqual(before);});
 it("continues protecting another customer's order",async()=>{const o=await place();await asUser(ids.bob);await expect(db.query('select public.cancel_customer_order($1,0)',[o.id])).rejects.toThrow('FORBIDDEN');});
 it("amends quantities and preserves prices without stock limits or reservations",async()=>{const before=await stock(),o=await place();await asUser(ids.owner);const items=JSON.stringify([{unit_id:unit,quantity:100}]),q=(await db.query<{q:unknown}>('select public.preview_order_amendment($1,0,$2) q',[o.id,items])).rows[0]!.q;await db.query("select public.amend_order($1,0,gen_random_uuid(),$2,'تعديل الكمية',$3)",[o.id,items,JSON.stringify(q)]);expect(await stock()).toEqual(before);});
 it("collects, delivers and returns goods without changing stock or automatically changing availability",async()=>{const before=await stock(),o=await place();await asUser(ids.owner);await db.query("select public.transition_order($1,0,'READY','تم تجهيز الطلب')",[o.id]);await db.query("select public.complete_order($1,1,gen_random_uuid(),'cash','تحصيل',48000)",[o.id]);await db.query("select public.create_admin_return($1,gen_random_uuid(),$2,'مرتجع جزئي')",[o.id,JSON.stringify([{unit_id:unit,quantity:1}])]);expect((await db.query('select total::int from public.orders where id=$1',[o.id])).rows).toEqual([{total:24000}]);expect((await db.query('select sum(amount)::int paid from public.order_payments where order_id=$1',[o.id])).rows).toEqual([{paid:48000}]);expect((await db.query('select available from public.products where id=$1',[product])).rows).toEqual([{available:true}]);expect(await stock()).toEqual(before);});
 it("does not expose the retired ledger even to a staff session",async()=>{await asUser(ids.owner);await expect(db.query('select * from public.inventory')).rejects.toThrow(/permission denied/i);});
 it("rejects old direct stock-update RPCs",async()=>{await asUser(ids.owner);await expect(db.query("select public.set_inventory_by_unit($1,$2,100,0,'محاولة قديمة')",[product,unit])).rejects.toThrow(/permission denied/i);});
 it("rejects a legacy stock import even outside the UI",async()=>{await asUser(ids.owner);await expect(db.query("select public.preview_import('stock','[]')")).rejects.toThrow('INVENTORY_RETIRED');});
 it("returns financial reports without stock quantities",async()=>{await asUser(ids.owner);const r=(await db.query<{r:{low_stock:unknown[]}}>("select public.sales_report('2026-10-01','2026-10-31') r")).rows[0]!.r;expect(r.low_stock).toEqual([]);});
 it("matches a partial phone suffix starting with zero as well as full local and Arabic digits",async()=>{await db.exec((await readFile('supabase/migrations/202610310029_partial_phone_search.sql','utf8')).replace(/^begin;/,'').replace(/commit;\s*$/,''));await db.query("update public.profiles set phone='+201500129529' where id=$1",[ids.alice]);await asUser(ids.owner);for(const query of ['0129529','٠١٢٩٥٢٩','01500129529','+201500129529'])expect((await db.query('select id from public.search_suggestions(\'customers\',$1)',[query])).rows).toEqual([{id:ids.alice}]);});
 it.each(['inventory.read','inventory.write'])("rejects retired permission %s even for owner",async(permission)=>{await asUser(ids.owner);expect((await db.query('select private.has_permission($1) allowed',[permission])).rows).toEqual([{allowed:false}]);await expect(db.query("select public.save_role_permissions('MANAGER',$1)",[[permission]])).rejects.toThrow('INVALID_PERMISSIONS');});
 it.each([ids.owner,ids.manager,ids.viewer])("omits legacy permissions from effective access for %s",async(id)=>{await asUser(id);const a=(await db.query<{a:{permissions:string[]}}>('select public.get_staff_access() a')).rows[0]!.a;expect(a.permissions).not.toContain('inventory.read');expect(a.permissions).not.toContain('inventory.write');});
 it("lets a read-only viewer fetch manual availability without granting write",async()=>{await asUser(ids.viewer);expect((await db.query("select private.has_permission('catalog.write') allowed")).rows).toEqual([{allowed:false}]);expect((await db.query("select available from public.admin_products_with_availability('DEMO-DRINK')")).rows).toEqual([{available:true}]);});
 it("rejects customer access to the staff availability list",async()=>{await asUser(ids.alice);await expect(db.query('select * from public.admin_products_with_availability()')).rejects.toThrow('FORBIDDEN');});
 it("defaults new imports to available and preserves an existing unavailable flag",async()=>{
  await asUser(ids.owner);const revision=(await db.query<{revision:number}>('select revision::int from public.products where id=$1',[product])).rows[0]!.revision;
  await db.query('select public.save_product_availability($1,$2,false)',[product,revision]);
  const next=(await db.query<{revision:number}>('select revision::int from public.products where id=$1',[product])).rows[0]!.revision;
  const rows=JSON.stringify([{sku:'CLEANUP-IMPORT',name:'منتج مستورد',category_id:'10000000-0000-4000-8000-000000000001',active:true,description:''},{id:product,revision:next,sku:'DEMO-DRINK',name:'منتج موجود',category_id:'10000000-0000-4000-8000-000000000001',active:true,description:''}]);
  const batch=(await db.query<{id:string}>("select public.preview_import('products',$1) id",[rows])).rows[0]!.id;await db.query('select public.apply_import($1)',[batch]);
  expect((await db.query("select sku,available from public.products where sku in('CLEANUP-IMPORT','DEMO-DRINK') order by sku")).rows).toEqual([{sku:'CLEANUP-IMPORT',available:true},{sku:'DEMO-DRINK',available:false}]);
 });
 it("still rejects an already-created legacy import batch",async()=>{await db.exec('reset role');const batch=(await db.query<{id:string}>("insert into public.import_batches(actor_id,kind,rows) values($1,'stock','[]') returning id",[ids.owner])).rows[0]!.id;await asUser(ids.owner);await expect(db.query('select public.apply_import($1)',[batch])).rejects.toThrow('INVENTORY_RETIRED');});

});

// Current timed-offer model, layered over all availability cleanups. Historical
// tests above intentionally exercise earlier migration contracts in isolation.
describe("timed offers without quantity tiers", () => {
 const unit="30000000-0000-4000-8000-000000000001", category="10000000-0000-4000-8000-000000000001";
 beforeEach(async()=>{
  await db.exec("reset role");
  for(const file of ["202610310028_manual_product_availability.sql","202610310029_partial_phone_search.sql","202610310030_manual_availability_cleanup.sql","20261104223757_timed_offers_without_quantity_tiers.sql","20261105195502_archive_pricing_rules.sql"])
   await db.exec((await readFile("supabase/migrations/"+file,"utf8")).replace(/^begin;/,"").replace(/commit;\s*$/,""));
  await db.exec("update public.products set available=true");
 });
 async function save(minimum=1,id:string|null=null,revision=0){
  return db.query<{id:string}>("select public.save_pricing_rule($1,$2,'عرض اختباري',null,$3,null,null,$4,'percent',1000,now()-interval '1 day',now()+interval '1 day',true) id",[id,revision,product,minimum]);
 }
 it("searches Arabic product/category prefixes and unit codes without loading the catalog",async()=>{
  await asUser(ids.owner);
  expect((await db.query("select id from public.search_pricing_targets('product','مش')")).rows).toEqual([{id:product}]);
  expect((await db.query("select id from public.search_pricing_targets('category','م')")).rows).toEqual([{id:category}]);
  expect((await db.query("select id from public.search_pricing_targets('unit','DEMO-DR')")).rows).toEqual([{id:unit}]);
  expect((await db.query("select * from public.search_pricing_targets('product','غير موجود')")).rows).toEqual([]);
 });
 it("keeps target suggestions capped and excludes archived products",async()=>{
  await db.query("insert into public.products(sku,name,category_id,active) select 'SEARCH-'||n,'منتج بحث '||n,$1,true from generate_series(1,12) n",[category]);
  await db.query("update public.products set archived_at=now() where id=$1",[product]);
  await asUser(ids.owner);
  expect((await db.query("select * from public.search_pricing_targets('product','منتج')")).rows).toHaveLength(8);
  expect((await db.query("select * from public.search_pricing_targets('product','DEMO-DR')")).rows).toEqual([]);
 });
 for(const [role,id] of [["customer",ids.alice],["viewer",ids.viewer],["order staff",ids.staff]] as const)
 it("denies direct target search to "+role+" even for empty input",async()=>{await asUser(id);await expect(db.query("select * from public.search_pricing_targets('category','')")).rejects.toThrow("FORBIDDEN");});
 it("denies anonymous target searches",async()=>{await db.exec("set local role anon");await expect(db.query("select * from public.search_pricing_targets('product','م')")).rejects.toThrow("permission denied");});
 it("rejects direct quantity tiers, null quantities, and stale revisions",async()=>{
  await asUser(ids.owner);await db.exec("savepoint invalid_tier");await expect(save(5)).rejects.toThrow("QUANTITY_TIERS_RETIRED");await db.exec("rollback to savepoint invalid_tier");
  await db.exec("savepoint invalid_null");await expect(db.query("select public.save_pricing_rule(null,0,'عرض',null,null,null,null,null,'percent',1000,now(),now()+interval '1 day',true)")).rejects.toThrow("QUANTITY_TIERS_RETIRED");await db.exec("rollback to savepoint invalid_null");
  const id=(await save()).rows[0]!.id;await save(1,id,0);await expect(save(1,id,0)).rejects.toThrow("EDIT_CONFLICT");
 });
 it("still denies customer writes at the RPC boundary",async()=>{await asUser(ids.alice);await expect(save()).rejects.toThrow("FORBIDDEN");});
 it("archives the offer without deleting it and restores it without applying the discount", async () => {
  await asUser(ids.owner);
  const id = (await save()).rows[0]!.id;
  expect((await db.query("select price_piastres::int from public.browse_catalog('DEMO-DRINK')")).rows).toEqual([{price_piastres:21600}]);
  await db.query("select public.archive_pricing_rule($1, 0, true)", [id]);
  expect((await db.query("select active, archived_at is not null archived from public.pricing_rules where id=$1", [id])).rows).toEqual([{active:false, archived:true}]);
  expect((await db.query("select price_piastres::int from public.browse_catalog('DEMO-DRINK')")).rows).toEqual([{price_piastres:24000}]);
  await db.exec("savepoint archived_edit");
  await expect(save(1, id, 1)).rejects.toThrow("archived_pricing_rule_is_inactive");
  await db.exec("rollback to savepoint archived_edit");
  await db.query("select public.archive_pricing_rule($1, 1, false)", [id]);
  expect((await db.query("select active, archived_at from public.pricing_rules where id=$1", [id])).rows).toEqual([{active:false, archived_at:null}]);
  await expect(db.query("select public.archive_pricing_rule($1, 1, true)", [id])).rejects.toThrow("EDIT_CONFLICT");
 });
 it("denies customer access to the offer archive RPC", async () => {
  await asUser(ids.alice);
  await expect(db.query("select public.archive_pricing_rule($1, 0, true)", [product])).rejects.toThrow("FORBIDDEN");
 });
 it("uses one best price for every quantity and ignores retained legacy tiers",async()=>{
  await db.query("insert into public.pricing_rules(name,product_id,minimum_quantity,kind,value,starts_at,ends_at) values('شريحة قديمة',$1,5,'fixed',1,now()-interval '1 day',now()+interval '1 day')",[product]);
  await asUser(ids.owner);await save();await db.exec("reset role");
  for(const quantity of [1,5,100])expect((await db.query<{p:{price:number}}>("select private.best_price($1,$2,$3,now()) p",[ids.alice,unit,quantity])).rows[0]!.p.price).toBe(21600);
  expect((await db.query("select minimum_quantity from public.pricing_rules where name='شريحة قديمة'")).rows).toEqual([{minimum_quantity:5}]);
 });
 it("promotes a category offer, without exposing private, future or expired rules",async()=>{
  await db.query("insert into public.pricing_rules(name,category_id,customer_id,kind,value,starts_at,ends_at) values('عرض القسم',$1,null,'percent',2000,now()-interval '1 day',now()+interval '1 day'),('خاص',$1,$2,'fixed',100,now()-interval '1 day',now()+interval '1 day'),('قادم',$1,null,'fixed',1,now()+interval '1 day',now()+interval '2 days'),('انتهى',$1,null,'fixed',1,now()-interval '2 days',now()-interval '1 day')",[category,ids.alice]);
  await db.exec("set local role anon");expect((await db.query("select sku,price_piastres::int from public.browse_catalog('',null,1)")).rows).toEqual([{sku:"DEMO-DRINK",price_piastres:19200}]);
 });
 it("keeps exclusive end timestamps and never stacks overlapping discounts",async()=>{
  await db.query("insert into public.pricing_rules(name,product_id,kind,value,starts_at,ends_at) values('عشرون',$1,'percent',2000,'2030-01-01T00:00:00Z','2030-01-02T00:00:00Z'),('عشرة',$1,'percent',1000,'2030-01-01T00:00:00Z','2030-01-02T00:00:00Z')",[product]);
  expect((await db.query<{p:{price:number}}>("select private.best_price(null,$1,50,'2030-01-01T00:00:00Z') p",[unit])).rows[0]!.p.price).toBe(19200);
  expect((await db.query<{p:{price:number}}>("select private.best_price(null,$1,50,'2030-01-02T00:00:00Z') p",[unit])).rows[0]!.p.price).toBe(24000);
 });
});
