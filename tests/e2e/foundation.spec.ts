import { test, expect } from "@playwright/test";

test("guest reviews and edits a persisted cart before signing in",async({page})=>{
 await page.goto("/");await page.evaluate(()=>localStorage.setItem("ferdous-cart-v1",JSON.stringify([{unit_id:"30000000-0000-4000-8000-000000000001",quantity:2,name:"منتج اختبار محفوظ",unit_name:"كرتونة"}])));await page.goto("/cart");
 await expect(page.getByRole("cell",{name:"منتج اختبار محفوظ",exact:true})).toBeVisible();await page.getByRole("spinbutton",{name:"كمية منتج اختبار محفوظ",exact:true}).fill("3");await page.reload();await expect(page.getByRole("spinbutton",{name:"كمية منتج اختبار محفوظ",exact:true})).toHaveValue("3");await expect(page.getByRole("link",{name:"تسجيل الدخول لاستكمال الطلب",exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("Arabic catalogue clearly reports pending configuration", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  const brand=page.getByRole("banner").getByRole("link",{name:"مخزن الفردوس — الرئيسية",exact:true});
  await expect(brand.getByRole("img",{name:"الفردوس لتجارة الجملة",exact:true})).toBeVisible();
  await expect(brand).toContainText("جملة تسند شغلك");
  expect(await brand.locator("img").evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("جملة على قد شغلك.");
  await expect(page.getByRole("status")).toContainText("الكتالوج قيد التجهيز");
  await expect(page.getByRole("status")).toContainText("استقبال الطلبات لم يبدأ بعد");
  await expect(page.getByRole("button", { name: /اطلب|إرسال|تسجيل/ })).toHaveCount(0);
});

test("works on the viewport without horizontal overflow", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("الكتالوج قيد التجهيز");
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("catalog.png"), fullPage: true });
  await page.getByRole("navigation").getByRole("link", { name: "التوصيل والدفع" }).click();
  await expect(page).toHaveURL(/#delivery$/);
  await expect(page.getByRole("heading", { name: "من المخزن إلى محلك" })).toBeVisible();
});

test("unknown routes have a working return link", async ({ page }) => {
  const response = await page.goto("/missing-page");
  expect(response?.status()).toBe(404);
  await page.getByRole("link", { name: "العودة للمنتجات" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/",{timeout:15000});
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("جملة على قد شغلك.");
});
