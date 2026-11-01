import { randomInt, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local tests only");
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function identity(role: "OWNER" | "MANAGER" | "VIEWER" | null, partialZero=false) {
  const admin = service();
  const phone = partialZero?`+2012${randomInt(1,10)}0${randomInt(100000,999999)}`:`+2012${randomInt(10000000, 99999999)}`;
  const password = randomUUID() + "Aa1!";
  const email=`admin-${randomUUID()}@example.test`;
  const name = `اختبار إدارة ${randomUUID()}`;
  const created = await admin.auth.admin.createUser({ phone, password, phone_confirm: true, ...(role?{email,email_confirm:true}:{}), user_metadata: { full_name: name } });
  expect(created.error).toBeNull();
  const id = created.data.user!.id;
  if (role) expect((await admin.from("staff_assignments").insert({ user_id: id, role })).error).toBeNull();
  return { phone, email, password, name, id, role, async cleanup() {
    // These UUIDs belong only to this test's newly created user.
    expect((await admin.from("staff_assignments").delete().eq("user_id", id)).error).toBeNull();
    expect((await admin.from("audit_logs").delete().eq("actor_id", id)).error).toBeNull();
    expect((await admin.from("audit_logs").delete().eq("entity", "staff_assignments").eq("after_data->>user_id", id)).error).toBeNull();
    expect((await admin.from("audit_logs").delete().eq("entity", "staff_assignments").eq("before_data->>user_id", id)).error).toBeNull();
    expect((await admin.from("profiles").delete().eq("id", id).eq("full_name", name)).error).toBeNull();
    expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  } };
}
async function login(page: Page, user: { phone: string; password: string; role?: string|null;email?:string }) {
  await page.goto(user.role?"/staff/login":"/login");
  await page.getByLabel(user.role?"البريد الإلكتروني":"رقم الموبايل", { exact: true }).filter({visible:true}).fill(user.role?user.email!:user.phone);
  await page.getByLabel("كلمة المرور", { exact: true }).filter({visible:true}).fill(user.password);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(user.role?/\/admin$/:/\/account$/);
}

test("staff can choose product and customer suggestions without submitting search", async ({page}) => {
  const owner=await identity("OWNER"), customer=await identity(null,true);
  try {
    await login(page,owner);
    await page.goto("/admin/products");
    await page.getByRole("combobox",{name:"البحث",exact:true}).fill("مش");
    await page.getByRole("option").filter({hasText:"DEMO-DRINK"}).click();
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]+$/);
    await page.goto("/admin/customers");
    await page.getByRole("combobox",{name:"اسم العميل أو رقم الموبايل"}).fill(customer.phone.slice(-7));
    await page.getByRole("option").filter({hasText:customer.phone}).click();
    await expect(page).toHaveURL(`/admin/customers/${customer.id}`);
  } finally {await customer.cleanup();await owner.cleanup();}
});

test("keeps the saved staff role and active flag after submit, repeated save and reload",async({page})=>{
 const owner=await identity("OWNER"),employee=await identity("VIEWER"),admin=service();
 try {
  await login(page,owner);await page.goto(`/admin/staff/${employee.id}`);
  const form=page.getByRole("heading",{name:"دور الموظف",exact:true}).locator("..");
  const role=form.getByRole("combobox",{name:"الدور",exact:true});
  const active=form.getByRole("checkbox",{name:"صلاحية الموظف مفعّلة",exact:true});
  const save=form.getByRole("button",{name:"حفظ دور الموظف",exact:true});
  const submit=async()=>{
   const response=page.waitForResponse(result=>result.request().method()==="POST"&&new URL(result.url()).pathname===`/admin/staff/${employee.id}`);
   await save.click();expect((await response).ok()).toBe(true);await expect(save).toBeEnabled();
   await expect(form.getByRole("status")).toContainText("تم تحديث صلاحيات الموظف");
  };
  const assignment=async()=>{const result=await admin.from("staff_assignments").select("role,active").eq("user_id",employee.id).single();expect(result.error).toBeNull();return result.data;};
  await expect(role).toHaveValue("VIEWER");await role.selectOption("ORDER_STAFF");await submit();
  expect(await assignment()).toEqual({role:"ORDER_STAFF",active:true});
  await expect(role).toHaveValue("ORDER_STAFF");
  await submit();
  expect(await assignment()).toEqual({role:"ORDER_STAFF",active:true});
  await page.reload();await expect(role).toHaveValue("ORDER_STAFF");await expect(active).toBeChecked();
  await active.uncheck();await submit();
  expect(await assignment()).toEqual({role:"ORDER_STAFF",active:false});
  await expect(role).toHaveValue("ORDER_STAFF");await expect(active).not.toBeChecked();
  await page.reload();await expect(role).toHaveValue("ORDER_STAFF");await expect(active).not.toBeChecked();
 }finally{await employee.cleanup();await owner.cleanup();}
});

test("redesigned admin navigation stays usable on desktop and mobile",async({page},testInfo)=>{
 const owner=await identity("OWNER");
 try {
  await login(page,owner);await page.goto("/admin");
  await expect(page.getByRole("heading",{name:"إدارة المخزن",exact:true})).toBeVisible();
  await page.evaluate(()=>document.fonts.ready);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("admin-overview.png"),fullPage:true});
  const nav=page.getByRole("navigation",{name:"الإدارة",exact:true});
  await nav.getByRole("link",{name:"المنتجات",exact:true}).click();
  await expect(nav.getByRole("link",{name:"المنتجات",exact:true})).toHaveAttribute("aria-current","page");
  await expect(page.getByRole("combobox",{name:"البحث",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("admin-products.png"),fullPage:true});
  await nav.getByRole("link",{name:"الطلبات والتحصيل",exact:true}).click();
  await expect(page).toHaveURL(/\/admin\/orders$/);
  await nav.getByRole("link",{name:"العروض والأسعار",exact:true}).click();
  await expect(page).toHaveURL(/\/admin\/pricing$/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{await owner.cleanup();}
});

test("owner manages catalogue, free zones, manual availability and audit", async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const admin = service();
  const user = await identity("OWNER");
  const marker = randomUUID().slice(0, 8);
  const sku = `QA-${marker.toUpperCase()}`;
  const name = `كرتونة اختبار ${marker}`;
  const categoryName = `قسم اختبار ${marker}`;
  const zoneName = `منطقة اختبار إدارة ${marker}`;
  try {
    await login(page, user);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin$/);
    await page.getByRole("navigation", { name: "الإدارة" }).getByRole("link", { name: "مناطق التوصيل", exact: true }).click();
    let add = page.locator(".new-reference");
    await add.getByLabel("اسم المنطقة", { exact: true }).filter({visible:true}).fill(zoneName);
    await expect(add.getByLabel("رسم التوصيل بالجنيه",{exact:true})).toHaveCount(0);
    await add.getByRole("button", { name: "إضافة المنطقة", exact: true }).click();
    await expect(add.getByRole("status")).toContainText("تم الحفظ");
    const zone = await admin.from("delivery_zones").select("fee_piastres").eq("name", zoneName).single();
    expect(zone.data?.fee_piastres).toBe(0);
    await page.goto("/admin/categories");
    add = page.locator(".new-reference");
    await add.getByLabel("اسم القسم", { exact: true }).filter({visible:true}).fill(categoryName);
    await add.getByRole("button", { name: "إضافة القسم", exact: true }).click();
    await expect(add.getByRole("status")).toContainText("تم الحفظ");
    await page.goto("/admin/products/new");
    await page.getByLabel("اسم المنتج", { exact: true }).filter({visible:true}).fill(name);
    await page.getByLabel("كود المنتج", { exact: true }).filter({visible:true}).fill(sku);
    await page.getByLabel("القسم", { exact: true }).filter({visible:true}).selectOption({ label: categoryName });
    await page.getByLabel("نشط في الكتالوج", { exact: true }).filter({visible:true}).check();
    await page.getByRole("button", { name: "إنشاء المنتج", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/products\/[\da-f-]+$/);
    const detailUrl = page.url();
    const unit = page.locator(".new-unit");
    await unit.getByLabel("اسم وحدة الجملة", { exact: true }).filter({visible:true}).fill("كرتونة");
    await unit.getByLabel("عدد القطع داخل الوحدة", { exact: true }).filter({visible:true}).fill("12");
    await unit.getByLabel("السعر بالجنيه", { exact: true }).filter({visible:true}).fill("123.45");
    await unit.getByRole("button", { name: "إضافة وحدة الجملة", exact: true }).click();
    await expect(unit.getByRole("status")).toContainText("تم حفظ وحدة الجملة");
    await expect(page.locator('.stock-editor,.inventory-panel')).toHaveCount(0);await expect(page.getByRole('heading',{name:'رصيد الموقع',exact:true})).toHaveCount(0);
    let editor=page.locator('.product-editor').filter({visible:true});await editor.getByLabel('التوافر',{exact:true}).selectOption('false');await editor.getByRole('button',{name:'حفظ المنتج',exact:true}).click();await expect(editor.getByRole('status')).toContainText('تم حفظ المنتج');await page.reload();await expect(page.getByLabel('التوافر',{exact:true}).filter({visible:true})).toHaveValue('false');
    await page.goto('/?q='+sku);const unavailable=page.locator('.product-card').filter({visible:true}).first();await expect(unavailable).toContainText('غير متوفر');await expect(unavailable.getByRole('button',{name:'غير متوفر حاليًا',exact:true})).toBeDisabled();await page.goto(detailUrl);editor=page.locator('.product-editor').filter({visible:true});await editor.getByLabel('التوافر',{exact:true}).selectOption('true');await editor.getByRole('button',{name:'حفظ المنتج',exact:true}).click();await expect(editor.getByRole('status')).toContainText('تم حفظ المنتج');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("admin-product.png"), fullPage: true });
    await page.goto(`/?q=${sku}`);
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await page.goto(detailUrl);
    await page.getByLabel("تأكيد أرشفة المنتج وإخفائه من الكتالوج", { exact: true }).filter({visible:true}).check();
    await page.getByRole("button", { name: "أرشفة المنتج", exact: true }).click();
    await expect(page.getByRole("button", { name: "إلغاء الأرشفة", exact: true })).toBeVisible();
    await page.goto(`/?q=${sku}`);
    await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(0);
    await page.goto(detailUrl);
    await page.getByLabel("تأكيد إلغاء الأرشفة", { exact: true }).filter({visible:true}).check();
    await page.getByRole("button", { name: "إلغاء الأرشفة", exact: true }).click();
    await expect(page.getByLabel("نشط في الكتالوج", { exact: true }).filter({visible:true})).not.toBeChecked();
    // Concurrent export fixtures can push this insertion past the newest page.
    const audit=await admin.from("audit_logs").select("id").eq("actor_id",user.id).eq("entity","products").eq("after_data->>name",name).order("id",{ascending:false}).limit(1).single();
    expect(audit.error).toBeNull();
    await page.goto(`/admin/audit?entity=products&after=${BigInt(audit.data!.id)+1n}`);
    await expect(page.locator(".audit-list").filter({visible:true})).toContainText(name);
    await expect(page.locator(".audit-list").filter({visible:true})).toContainText(user.name);
  } finally {
    const products = await admin.from("products").select("id").eq("sku", sku);
    for (const product of products.data ?? []) {
      expect((await admin.from("stock_movements").delete().eq("product_id", product.id)).error).toBeNull();
      expect((await admin.from("product_units").delete().eq("product_id", product.id)).error).toBeNull();
      expect((await admin.from("inventory").delete().eq("product_id", product.id)).error).toBeNull();
      expect((await admin.from("products").delete().eq("id", product.id)).error).toBeNull();
    }
    expect((await admin.from("categories").delete().eq("name", categoryName)).error).toBeNull();
    expect((await admin.from("delivery_zones").delete().eq("name", zoneName)).error).toBeNull();
    await user.cleanup();
  }
});

test("creates automatic codes from a blank form and during concurrent requests", async ({ page }) => {
  const admin = service();
  const user = await identity("OWNER");
  const name = `اختبار كود تلقائي ${randomUUID()}`;
  const category = { id: randomUUID(), name: `قسم ${name}`, active: true };
  try {
    expect((await admin.from("categories").insert(category)).error).toBeNull();
    await login(page,user);
    await page.goto("/admin/products/new");
    await page.getByLabel("اسم المنتج", { exact: true }).filter({visible:true}).fill(name);
    await page.getByLabel("القسم", { exact: true }).filter({visible:true}).selectOption(category.id);
    await expect(page.getByLabel("كود المنتج", { exact: true }).filter({visible:true})).toHaveValue("");
    await page.getByRole("button", { name: "إنشاء المنتج", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/products\/[\da-f-]+$/);
    const codeInput = page.getByLabel("كود المنتج", { exact: true }).filter({visible:true});
    await expect(codeInput).toHaveValue(/^FD-\d{6,}$/);
    const code = await codeInput.inputValue();
    await codeInput.fill("");
    await page.getByRole("button", { name: "حفظ المنتج", exact: true }).click();
    await expect(page.locator(".product-editor").getByRole("status")).toContainText("تم حفظ المنتج");
    await page.reload();
    await expect(codeInput).toHaveValue(code);
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await client.auth.signInWithPassword({phone:user.phone,password:user.password})).error).toBeNull();
    const creates = await Promise.all(Array.from({length:4}, (_,i)=>client.rpc("save_admin_product", {
      p_id:null,p_expected_revision:0,p_sku:"",p_name:`${name} ${i}`,p_category:category.id,p_description:"",p_active:false,
    })));
    expect(creates.every((result)=>!result.error && typeof result.data === "string")).toBe(true);
    const records = await admin.from("products").select("sku").eq("category_id",category.id);
    expect(records.data).toHaveLength(5);
    expect(new Set(records.data!.map((row)=>row.sku)).size).toBe(5);
    expect(records.data!.every((row)=>/^FD-\d{6,}$/.test(row.sku))).toBe(true);
  } finally {
    const products = await admin.from("products").select("id").eq("category_id",category.id);
    for (const product of products.data ?? []) {
      expect((await admin.from("inventory").delete().eq("product_id",product.id)).error).toBeNull();
      expect((await admin.from("products").delete().eq("id",product.id)).error).toBeNull();
    }
    expect((await admin.from("categories").delete().eq("id",category.id)).error).toBeNull();
    await user.cleanup();
  }
});

test("uploads, replaces and removes real product images with protected storage",async({page},testInfo)=>{
  const admin=service();
  const user=await identity("OWNER");
  const marker=randomUUID();
  const category={id:randomUUID(),name:`قسم صورة اختبار ${marker}`,active:true};
  const product: {id:string;category_id:string;sku:string;name:string;active:boolean}={id:randomUUID(),category_id:category.id,sku:`IMG-${marker.slice(0,8).toUpperCase()}`,name:`صورة اختبار ${marker}`,active:true};
  const first=await sharp({create:{width:1800,height:1200,channels:3,background:"#426b50"}}).png().toBuffer();
  const second=await sharp({create:{width:800,height:600,channels:3,background:"#c9a450"}}).jpeg().toBuffer();
  const paths:string[]=[];
  try {
    expect((await admin.from("categories").insert(category)).error).toBeNull();
    await login(page,user);
    await page.goto("/admin/products/new");
    await page.getByLabel("اسم المنتج",{exact:true}).filter({visible:true}).fill(product.name);
    await page.getByLabel("كود المنتج",{exact:true}).filter({visible:true}).fill(product.sku);
    await page.getByLabel("القسم",{exact:true}).filter({visible:true}).selectOption(category.id);
    await page.getByLabel("نشط في الكتالوج",{exact:true}).filter({visible:true}).check();
    await page.getByRole("button",{name:"إنشاء المنتج",exact:true}).click();
    await expect(page).toHaveURL(/\/admin\/products\/[\da-f-]+$/);
    product.id=page.url().split("/").at(-1)!;
    expect((await admin.from("product_units").insert({product_id:product.id,name:"كرتونة",pieces_per_unit:12,price_piastres:15000,minimum_quantity:1,active:true})).error).toBeNull();
    const editor=page.locator(".product-image-panel");
    const input=editor.getByLabel("اختيار صورة المنتج",{exact:true}).filter({visible:true});
    await input.setInputFiles({name:"fake.png",mimeType:"image/png",buffer:Buffer.from("invalid image content")});
    await editor.getByRole("button",{name:"رفع الصورة",exact:true}).click();
    await expect(editor.getByRole("alert")).toContainText("الصورة غير صالحة");
    await input.setInputFiles({name:"product.png",mimeType:"image/png",buffer:first});
    await editor.getByRole("button",{name:"رفع الصورة",exact:true}).click();
    await expect(editor.locator(".image-upload-form").getByRole("status")).toContainText("تم حفظ صورة المنتج");
    await expect(editor.getByRole("img",{name:product.name,exact:true})).toBeVisible();
    let record=await admin.from("product_images").select("storage_path,width,height,revision").eq("product_id",product.id).single();
    expect(record.data?.width).toBe(1280); expect(record.data?.height).toBe(853);
    paths.push(record.data!.storage_path);
    const file=await admin.storage.from("product-images").download(paths[0]!);
    expect(file.error).toBeNull();
    expect((await sharp(Buffer.from(await file.data!.arrayBuffer())).metadata()).format).toBe("webp");
    await page.goto(`/?q=${product.sku}`);
    const publicImage=page.getByRole("img",{name:product.name,exact:true});
    await expect(publicImage).toBeVisible();
    expect(await publicImage.evaluate((image)=>image instanceof HTMLImageElement && image.complete && image.naturalWidth>0)).toBe(true);
    await page.screenshot({path:testInfo.outputPath("catalog-product-image.png"),fullPage:true});
    await page.goto(`/admin/products/${product.id}`);
    // Another open form must not overwrite the replacement.
    const stale=await page.context().newPage();
    await stale.goto(`/admin/products/${product.id}`);
    await input.setInputFiles({name:"replacement.jpg",mimeType:"image/jpeg",buffer:second});
    await editor.getByRole("button",{name:"استبدال الصورة",exact:true}).click();
    await expect(editor.locator(".image-upload-form").getByRole("status")).toContainText("تم حفظ صورة المنتج");
    record=await admin.from("product_images").select("storage_path,width,height,revision").eq("product_id",product.id).single();
    paths.push(record.data!.storage_path); expect(record.data?.revision).toBe(2);
    expect((await admin.storage.from("product-images").download(paths[0]!)).error).not.toBeNull();
    await stale.getByLabel("اختيار صورة المنتج",{exact:true}).filter({visible:true}).setInputFiles({name:"stale.png",mimeType:"image/png",buffer:first});
    await stale.getByRole("button",{name:"استبدال الصورة",exact:true}).click();
    await expect(stale.locator(".image-upload-form").getByRole("alert")).toContainText("الصورة اتغيرت");
    await stale.close();
    const untrusted=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
    const forbiddenPath=`${product.id}/${randomUUID()}.webp`;
    paths.push(forbiddenPath);
    expect((await untrusted.storage.from("product-images").upload(forbiddenPath,await sharp(second).webp().toBuffer(),{contentType:"image/webp"})).error).not.toBeNull();
    expect((await untrusted.auth.signInWithPassword({phone:user.phone,password:user.password})).error).toBeNull();
    const blocked=await untrusted.rpc("commit_product_image",{p_actor:user.id,p_product:product.id,p_expected_revision:2,p_path:null,p_width:null,p_height:null});
    expect(blocked.error?.code).toBe("42501");
    await editor.getByLabel("تأكيد حذف صورة المنتج",{exact:true}).filter({visible:true}).check();
    await editor.getByRole("button",{name:"حذف الصورة",exact:true}).click();
    await expect(editor.getByRole("img")).toHaveCount(0);
    expect((await admin.storage.from("product-images").download(paths[1]!)).error).not.toBeNull();
    const removed=await admin.from("product_images").select("storage_path,revision").eq("product_id",product.id).single();
    expect(removed.data).toEqual({storage_path:null,revision:3});
    await page.goto(`/?q=${product.sku}`);
    await expect(page.getByRole("heading",{name:product.name,exact:true})).toBeVisible();
    await expect(page.getByRole("img",{name:product.name,exact:true})).toHaveCount(0);
  } finally {
    if (paths.length) expect((await admin.storage.from("product-images").remove(paths)).error).toBeNull();
    expect((await admin.from("product_images").delete().eq("product_id",product.id)).error).toBeNull();
    expect((await admin.from("product_units").delete().eq("product_id",product.id)).error).toBeNull();
    expect((await admin.from("inventory").delete().eq("product_id",product.id)).error).toBeNull();
    expect((await admin.from("products").delete().eq("id",product.id)).error).toBeNull();
    expect((await admin.from("categories").delete().eq("id",category.id)).error).toBeNull();
    await user.cleanup();
  }
});

for (const role of [null, "MANAGER", "VIEWER"] as const) {
  test(`${role ?? "customer"} receives only their authorized admin screens`, async ({ page }) => {
    const user = await identity(role);
    try {
      await login(page, user);
      await page.goto("/admin");
      if (!role) {
        await expect(page).toHaveURL(/\/account\?notice=staff-only$/);
        await expect(page.getByRole("link", { name: "لوحة الإدارة", exact: true })).toHaveCount(0);
      } else {
        await expect(page.getByRole("navigation", { name: "الإدارة" })).toBeVisible();
        await page.goto("/admin/settings");
        await expect(page).toHaveURL(/\/admin\?notice=forbidden$/);
        await page.goto("/admin/products");
        await expect(page.getByRole("heading", { name: "المنتجات", exact: true })).toBeVisible();
        await expect(page.getByRole("link", { name: "إضافة منتج", exact: true })).toHaveCount(role === "MANAGER" ? 1 : 0);
        const product=(await service().from("products").select("id,available").eq("sku","DEMO-DRINK").single()).data!;
        await page.goto("/admin/products?q=DEMO-DRINK");
        await expect(page.getByRole("columnheader",{name:"التوافر اليدوي",exact:true})).toBeVisible();
        const row=page.locator("tr").filter({has:page.locator(`a[href="/admin/products/${product.id}"]`)});
        await expect(row.getByRole("cell",{name:product.available?"متوفر":"غير متوفر",exact:true})).toBeVisible();
        await page.goto(`/admin/products/${product.id}`);
        await expect(page.getByText("التوافر اليدوي:",{exact:false}).filter({visible:true})).toBeVisible();
        if(role==="VIEWER")await expect(page.locator('select[name="available"]')).toHaveCount(0);

      }
    } finally { await user.cleanup(); }
  });
}
