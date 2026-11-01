import {randomUUID,randomInt} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {test,expect} from "@playwright/test";

test("shows genuine offers and supports hover, wholesale quantities, a persistent drawer and list view",async({page,isMobile},info)=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 if(!["localhost","127.0.0.1"].includes(new URL(url).hostname))throw new Error("Local tests only");
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const category=randomUUID(),rule=randomUUID();let product="",unit="",owner="";
 const phone=`+2015${randomInt(10000000,99999999)}`,password=randomUUID()+"Aa1!";
 const client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const user=await admin.auth.admin.createUser({phone,password,phone_confirm:true,email:`offers-${randomUUID()}@example.test`,email_confirm:true,user_metadata:{full_name:"اختبار تصميم العروض"}});expect(user.error).toBeNull();owner=user.data.user!.id;
  expect((await admin.from("staff_assignments").insert({user_id:owner,role:"OWNER"})).error).toBeNull();expect((await client.auth.signInWithPassword({phone,password})).error).toBeNull();
  expect((await admin.from("categories").insert({id:category,name:`قسم عروض اختباري ${category}`})).error).toBeNull();
  const created=await client.rpc("save_admin_product",{p_id:null,p_expected_revision:0,p_sku:`ZZ-OFFER-${category}`,p_name:"منتج اختبار عرض حقيقي",p_category:category,p_description:"",p_active:true});expect(created.error).toBeNull();product=String(created.data);
  const createdUnit=await client.rpc("save_admin_unit",{p_id:null,p_product:product,p_expected_revision:0,p_name:"كرتونة",p_pieces:12,p_price:10000,p_minimum:2,p_active:true});expect(createdUnit.error).toBeNull();unit=String(createdUnit.data);
  expect((await admin.from("pricing_rules").insert({id:rule,name:"عرض اختبار ٢٠٪",unit_id:unit,kind:"percent",value:2000,starts_at:new Date(Date.now()-60000).toISOString(),ends_at:new Date(Date.now()+3600000).toISOString()})).error).toBeNull();
  await page.goto(`/?category=${category}`);
  await expect(page.getByRole("combobox",{name:"الترتيب",exact:true})).toHaveValue("offers");
  await expect(page.getByRole("heading",{name:"عروض تستاهل مكان على رفك"})).toBeVisible();
  const card=page.getByRole("article").first();
  await expect(card).toContainText("منتج اختبار عرض حقيقي");
  await expect(card.locator(".offer-badge")).toHaveText("عرض");
  await expect(card.locator("del")).toBeVisible();
  await page.evaluate(()=>document.fonts.ready);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath("genuine-offers.png"),fullPage:true});
  const quantity=card.getByRole("spinbutton",{name:"كمية منتج اختبار عرض حقيقي كرتونة",exact:true});
  await expect(quantity).toHaveValue("2");
  await expect(card.getByRole("button",{name:"تقليل كمية منتج اختبار عرض حقيقي كرتونة",exact:true})).toBeDisabled();
  if(!isMobile){
   await page.getByRole("heading",{name:"عروض تستاهل مكان على رفك"}).hover();
   await expect(card.locator(".cart-action")).toHaveCSS("opacity","0");
   const before=await card.boundingBox();await card.hover();
   await expect(card.locator(".cart-action")).toHaveCSS("opacity","1");
   expect((await card.boundingBox())!.height).toBe(before!.height);
   await quantity.focus();await expect(card.locator(".cart-action")).toHaveCSS("opacity","1");
  }else await expect(card.locator(".cart-action")).toHaveCSS("opacity","1");
  await card.getByRole("button",{name:"زيادة كمية منتج اختبار عرض حقيقي كرتونة",exact:true}).click();
  await expect(quantity).toHaveValue("3");
  await card.getByRole("button",{name:"إضافة للسلة",exact:true}).click();
  const drawer=page.getByRole("dialog",{name:"سلتك",exact:true});await expect(drawer).not.toBeVisible();await expect(card.getByRole("status")).toContainText("تمت الإضافة للسلة");await page.getByRole("button",{name:"السلة",exact:true}).click();await expect(drawer).toBeVisible();
  await expect(page.getByRole("button",{name:"إغلاق السلة",exact:true})).toBeFocused();
  await expect(drawer.getByRole("spinbutton")).toHaveValue("3");
  expect(await page.evaluate(()=>document.body.style.overflow)).toBe("hidden");
  await drawer.getByRole("button",{name:"زيادة كمية السلة منتج اختبار عرض حقيقي كرتونة",exact:true}).click();
  await expect(drawer.getByRole("spinbutton")).toHaveValue("4");
  await page.screenshot({path:info.outputPath("cart-drawer.png"),fullPage:true});
  await page.keyboard.press("Escape");await expect(drawer).not.toBeVisible();
  await expect(page.getByRole("button",{name:"السلة",exact:true})).toBeFocused();
  expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe("hidden");
  await page.getByRole("button",{name:"قائمة مختصرة",exact:true}).click();
  await expect(page.locator(".catalog-results").filter({visible:true})).toHaveAttribute("data-view","list");
  await page.reload();await expect(page.locator(".catalog-results").filter({visible:true})).toHaveAttribute("data-view","list");
  await expect(card.locator(".cart-action")).toHaveCSS("opacity","1");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath("catalog-list.png"),fullPage:true});
  await page.getByRole("button",{name:"السلة",exact:true}).click();await expect(drawer.getByRole("spinbutton")).toHaveValue("4");
  await drawer.getByRole("link",{name:"مراجعة السلة",exact:true}).click();await expect(page).toHaveURL(/\/cart$/);
  await expect(drawer).not.toBeVisible();await expect(page.getByRole("spinbutton",{name:"كمية منتج اختبار عرض حقيقي",exact:true})).toHaveValue("4");
  await page.goto(`/?category=${category}`);await page.getByRole("button",{name:"السلة",exact:true}).click();
  await drawer.getByRole("button",{name:"حذف منتج اختبار عرض حقيقي من السلة",exact:true}).click();
  await expect(drawer.getByRole("heading",{name:"السلة لسه فاضية",exact:true})).toBeVisible();
  await drawer.getByRole("button",{name:"كمّل اختيار المنتجات",exact:true}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("ferdous-cart-v1")??"[]").length)).toBe(0);
  await page.emulateMedia({reducedMotion:"reduce"});
  expect(await page.locator(".offers-banner").evaluate(el=>getComputedStyle(el).animationName)).toBe("none");
 }finally{
  for(const [table,key,id] of [["pricing_rules","id",rule],["product_units","id",unit],["products","id",product],["categories","id",category]] as const)if(id)expect((await admin.from(table).delete().eq(key,id)).error).toBeNull();
  if(owner){expect((await admin.from("audit_logs").delete().eq("actor_id",owner)).error).toBeNull();expect((await admin.from("staff_assignments").delete().eq("user_id",owner)).error).toBeNull();expect((await admin.from("profiles").delete().eq("id",owner)).error).toBeNull();expect((await admin.auth.admin.deleteUser(owner)).error).toBeNull();}
 }
});
