import { randomBytes, randomInt, randomUUID, createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test as base, expect, type Page } from "@playwright/test";

type Identity = { phone: string; password: string; fullName: string; create: () => Promise<string> };
type Fixtures = { admin: SupabaseClient; zone: { id: string; name: string }; identity: Identity };
const test = base.extend<Fixtures>({
  admin: async ({ baseURL }, use) => {
    if (!baseURL?.startsWith("http://127.0.0.1:")) throw new Error("Local browser test only");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local test environment only");
    await use(createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }));
  },
  zone: async ({ admin }, use) => {
    const zone = { id: randomUUID(), name: `منطقة اختبار خيالية ${randomUUID().slice(0, 8)}` };
    const added = await admin.from("delivery_zones").insert({ ...zone, active: true, fee_piastres: 0 });
    expect(added.error).toBeNull();
    await use(zone);
    const removed = await admin.from("delivery_zones").delete().eq("id", zone.id);
    expect(removed.error).toBeNull();
  },
  identity: async ({ admin, zone }, use) => {
    const phone = `+2010${randomInt(10000000, 99999999)}`;
    const password = randomUUID() + "Aa1!";
    const fullName = `عميل اختبار ${randomUUID()}`;
    const create = async () => {
      const created = await admin.auth.admin.createUser({ phone, password, phone_confirm: true,
        user_metadata: { full_name: fullName, shop_name: "محل اختبار خيالي", delivery_address: "عنوان اختبار محلي داخل الإسكندرية", area: zone.name } });
      expect(created.error).toBeNull();
      return created.data.user!.id;
    };
    await use({ phone, password, fullName, create });
    // Only this test's phone AND unique marker are eligible for cleanup.
    const profiles = await admin.from("profiles").select("id").eq("phone", phone).eq("full_name", fullName);
    expect(profiles.error).toBeNull();
    for (const profile of profiles.data ?? []) {
      expect((await admin.from("customer_addresses").delete().eq("customer_id", profile.id)).error).toBeNull();
      expect((await admin.from("profiles").delete().eq("id", profile.id)).error).toBeNull();
      expect((await admin.auth.admin.deleteUser(profile.id)).error).toBeNull();
    }
  },
});

async function login(page: Page, identity: Identity) {
  await page.goto("/login");
  await page.getByLabel("رقم الموبايل", { exact: true }).filter({visible:true}).fill(identity.phone);
  await page.getByLabel("كلمة المرور", { exact: true }).filter({visible:true}).fill(identity.password);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test("registers, persists profile changes, signs out, and signs in securely", async ({ page, identity }, testInfo) => {
  await page.goto("/register");
  await page.getByLabel("الاسم بالكامل", { exact: true }).filter({visible:true}).fill(identity.fullName);
  await page.getByLabel("اسم المحل", { exact: true }).filter({visible:true}).fill("محل تسجيل تجريبي");
  await page.getByLabel("المنطقة داخل الإسكندرية", { exact: true }).filter({visible:true}).fill("منطقة خيالية");
  await page.getByLabel("عنوان التوصيل التفصيلي", { exact: true }).filter({visible:true}).fill("عنوان تفصيلي تجريبي داخل الإسكندرية");
  await page.getByLabel("رقم الموبايل", { exact: true }).filter({visible:true}).fill(identity.phone);
  await page.getByLabel("كلمة المرور", { exact: true }).filter({visible:true}).fill(identity.password);
  await page.getByLabel("تأكيد كلمة المرور", { exact: true }).filter({visible:true}).fill(identity.password);
  await page.getByRole("button", { name: "إنشاء الحساب", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText(identity.phone, { exact: true })).toBeVisible();
  const cookies = (await page.context().cookies()).filter((cookie) => cookie.name.startsWith("sb-"));
  expect(cookies.length).toBeGreaterThan(0);
  expect(cookies.every((cookie) => cookie.httpOnly && cookie.sameSite === "Lax")).toBe(true);
  await page.getByLabel("اسم المحل", { exact: true }).filter({visible:true}).fill("محل تم تحديثه");
  await page.getByRole("button", { name: "حفظ البيانات", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("تم حفظ بياناتك");
  await page.reload();
  await expect(page.getByLabel("اسم المحل", { exact: true }).filter({visible:true})).toHaveValue("محل تم تحديثه");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("customer-account.png"), fullPage: true });
  await page.getByRole("button", { name: "تسجيل الخروج", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("رقم الموبايل", { exact: true }).filter({visible:true}).fill(identity.phone);
  await page.getByLabel("كلمة المرور", { exact: true }).filter({visible:true}).fill("wrong-password");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page.locator(".form-error")).toContainText("راجع الرقم وكلمة المرور");
  await login(page, identity);
  await expect(page.getByLabel("الاسم بالكامل", { exact: true }).filter({visible:true})).toHaveValue(identity.fullName);
  expect(await page.content()).not.toContain(identity.password);
});

test("manages saved addresses and rejects cross-customer RPCs", async ({ page, identity, admin, zone }) => {
  const ownerId = await identity.create();
  await login(page, identity);
  await page.getByRole("link", { name: "إدارة العناوين", exact: true }).click();
  const add = page.locator(".new-address");
  for (const address of ["عنوان اختبار أول داخل الإسكندرية", "عنوان اختبار ثان داخل الإسكندرية"]) {
    await add.getByLabel("منطقة التوصيل", { exact: true }).filter({visible:true}).selectOption(zone.id);
    await add.getByLabel("العنوان التفصيلي", { exact: true }).filter({visible:true}).fill(address);
    await add.getByLabel("العنوان الافتراضي", { exact: true }).filter({visible:true}).check();
    await add.getByRole("button", { name: "إضافة العنوان", exact: true }).click();
    await expect(add.getByRole("status")).toContainText("تم حفظ العنوان");
  }
  const saved = page.locator(".address-list > section");
  await expect(saved).toHaveCount(3);
  await expect(saved.nth(0).getByLabel("العنوان الافتراضي", { exact: true }).filter({visible:true})).not.toBeChecked();
  await expect(saved.nth(1).getByLabel("العنوان الافتراضي", { exact: true }).filter({visible:true})).not.toBeChecked();
  await expect(saved.nth(2).getByLabel("العنوان الافتراضي", { exact: true }).filter({visible:true})).toBeChecked();
  const records = await admin.from("customer_addresses").select("id").eq("customer_id", ownerId);
  const victim = records.data![0]!.id;
  const bob = await admin.auth.admin.createUser({ phone: `+2011${randomInt(10000000, 99999999)}`, password: identity.password, phone_confirm: true, user_metadata: { full_name: `اختبار عزل ${randomUUID()}` } });
  expect(bob.error).toBeNull();
  const bobId = bob.data.user!.id;
  try {
    const other = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await other.auth.signInWithPassword({ phone: bob.data.user!.phone!, password: identity.password })).error).toBeNull();
    expect((await other.from("customer_addresses").select("id").eq("id", victim)).data).toEqual([]);
    expect((await other.rpc("save_customer_address", { p_id: victim, p_zone: zone.id, p_address: "عنوان غير مصرح من حساب آخر", p_notes: "", p_default: true })).error).not.toBeNull();
    expect((await other.rpc("delete_customer_address", { p_id: victim })).error).not.toBeNull();
  } finally {
    expect((await admin.from("profiles").delete().eq("id", bobId)).error).toBeNull();
    expect((await admin.auth.admin.deleteUser(bobId)).error).toBeNull();
  }
  await saved.nth(2).getByLabel("تأكيد حذف هذا العنوان", { exact: true }).filter({visible:true}).check();
  await saved.nth(2).getByRole("button", { name: "حذف العنوان", exact: true }).click();
  await expect(saved).toHaveCount(2);
  await expect(saved.nth(0).getByLabel("العنوان الافتراضي", { exact: true }).filter({visible:true})).toBeChecked();
  const ownClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await ownClient.auth.signInWithPassword({ phone: identity.phone, password: identity.password })).error).toBeNull();
  const concurrent = await Promise.all([1, 2].map((index) => ownClient.rpc("save_customer_address", {
    p_id: null, p_zone: zone.id, p_address: `عنوان متزامن تجريبي ${index} داخل الإسكندرية`, p_notes: "", p_default: true,
  })));
  expect(concurrent.every((result) => !result.error)).toBe(true);
  const defaults = await ownClient.from("customer_addresses").select("id").eq("is_default", true);
  expect(defaults.error).toBeNull();
  expect(defaults.data).toHaveLength(1);
});

test("uses the registered shop address automatically and keeps it after reload",async({page,identity,admin,zone})=>{
  const id=await identity.create();await login(page,identity);
  const saved=await admin.from("customer_addresses").select("id,is_default,address").eq("customer_id",id).eq("from_profile",true).single();
  expect(saved.error).toBeNull();expect(saved.data?.is_default).toBe(true);
  await page.evaluate(()=>localStorage.setItem("ferdous-cart-v1",JSON.stringify([{unit_id:"30000000-0000-4000-8000-000000000001",quantity:1,name:"منتج اختبار",unit_name:"كرتونة"}])));
  await page.goto("/cart");
  await expect(page.getByRole("combobox",{name:"عنوان التوصيل",exact:true})).toHaveValue(saved.data!.id);
  await expect(page.getByRole("combobox",{name:"عنوان التوصيل",exact:true})).toContainText(zone.name);
  await expect(page.getByRole("button",{name:"حساب الإجمالي ومراجعة الطلب",exact:true})).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("combobox",{name:"عنوان التوصيل",exact:true})).toHaveValue(saved.data!.id);
});

test("reuses the original address when only the delivery zone needs confirmation",async({page,identity,admin,zone})=>{
  const id=await identity.create();
  expect((await admin.from("profiles").update({area:"منطقة مكتوبة باسم قديم"}).eq("id",id)).error).toBeNull();
  await login(page,identity);
  await page.evaluate(()=>localStorage.setItem("ferdous-cart-v1",JSON.stringify([{unit_id:"30000000-0000-4000-8000-000000000001",quantity:1,name:"منتج اختبار",unit_name:"كرتونة"}])));
  await page.goto("/cart");
  await expect(page.getByRole("heading",{name:"عنوان المحل المسجل",exact:true})).toBeVisible();
  await expect(page.getByText("منطقة مكتوبة باسم قديم — عنوان اختبار محلي داخل الإسكندرية",{exact:true})).toBeVisible();
  await page.getByRole("combobox",{name:"منطقة توصيل المحل",exact:true}).selectOption(zone.id);
  await page.getByRole("button",{name:"استخدام عنوان المحل",exact:true}).click();
  await expect(page.getByRole("combobox",{name:"عنوان التوصيل",exact:true})).toContainText("عنوان اختبار محلي داخل الإسكندرية");
  const addresses=await admin.from("customer_addresses").select("address,zone_id").eq("customer_id",id);
  expect(addresses.data).toEqual([{address:"عنوان اختبار محلي داخل الإسكندرية",zone_id:zone.id}]);
  await page.reload();
  await expect(page.getByRole("combobox",{name:"عنوان التوصيل",exact:true})).toContainText(zone.name);
  await expect(page.getByRole("heading",{name:"عنوان المحل المسجل",exact:true})).toHaveCount(0);
});

test("applies shared attempt limits atomically and blocks the login form", async ({ page, identity, admin }) => {
  await identity.create();
  const bucket = randomBytes(32).toString("hex");
  const requests = await Promise.all(Array.from({ length: 12 }, () => admin.rpc("consume_auth_limit", { p_bucket: bucket, p_max: 4, p_window_seconds: 86400 })));
  expect(requests.every((result) => !result.error)).toBe(true);
  expect(requests.filter((result) => result.data === true)).toHaveLength(4);
  const secret = process.env.AUTH_RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const phoneBucket = createHmac("sha256", secret).update(`login:900:phone:${identity.phone}`).digest("hex");
  await Promise.all(Array.from({ length: 10 }, () => admin.rpc("consume_auth_limit", { p_bucket: phoneBucket, p_max: 10, p_window_seconds: 900 })));
  await page.goto("/login");
  const rejected=page.waitForResponse(response=>response.request().method()==="POST"&&new URL(response.url()).pathname==="/login");
  await page.getByLabel("رقم الموبايل", { exact: true }).filter({visible:true}).fill(identity.phone);
  await page.getByLabel("كلمة المرور", { exact: true }).filter({visible:true}).fill(identity.password);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  const response=await rejected;expect(response.ok()).toBe(true);
  await expect(page.locator(".form-error").filter({visible:true})).toContainText("محاولات كثيرة",{timeout:30000});
  await expect(page).toHaveURL(/\/login$/);
});
