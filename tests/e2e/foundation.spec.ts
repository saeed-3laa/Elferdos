import { test, expect } from "@playwright/test";

for (const width of [320, 390, 768, 1440]) {
 test(`guest edits quantities, sees Remove, and keeps checkout context at ${width}px`, async ({page,request},testInfo)=>{
  await page.setViewportSize({width,height:900});
  await page.addInitScript(()=>{
   if(!localStorage.getItem("ferdous-cart-v1"))localStorage.setItem("ferdous-cart-v1",JSON.stringify([{unit_id:"30000000-0000-4000-8000-000000000001",quantity:6,minimum_quantity:6,name:"منتج اختبار محفوظ",unit_name:"كرتونة"}]));
  });
  const authPages=await Promise.all([request.get("/login?next=cart"),request.get("/register?next=cart")]);
  expect(authPages.every(response=>response.ok())).toBe(true);
  await page.goto("/cart");
  const input=page.getByRole("spinbutton",{name:"كمية منتج اختبار محفوظ كرتونة"});
  await expect(input).toHaveAttribute("min","6");
  await input.fill("");
  await expect(input).toHaveValue("");
  await input.fill("1");
  await input.press("Enter");
  await expect(page.getByRole("row").getByRole("alert")).toContainText("تم الاحتفاظ بالكمية السابقة");
  await expect(input).toHaveValue("6");
  await input.fill("100000");
  await input.press("Tab");
  await page.reload();
  await expect(input).toHaveValue("100000");
  await page.evaluate(()=>document.fonts.ready);
  expect(await input.evaluate(el=>{
   const input=el as HTMLInputElement, style=getComputedStyle(input);
   const canvas=document.createElement("canvas").getContext("2d")!;
   canvas.font=`${style.fontSize} ${style.fontFamily}`;
   return input.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)>=canvas.measureText(input.value).width;
  })).toBe(true);
  await expect(page.getByRole("button",{name:"حذف منتج اختبار محفوظ من السلة"})).toBeInViewport({ratio:1});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("cart-quantity.png"),fullPage:true});
  await page.getByRole("link",{name:"تسجيل الدخول لاستكمال الطلب",exact:true}).click();
  await expect(page).toHaveURL(/\/login\?next=cart$/);
  await page.getByRole("link",{name:"إنشاء حساب جديد"}).click();
  await expect(page).toHaveURL(/\/register\?next=cart$/);
 });
}

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

test("unknown routes have a working return link", async ({ page, baseURL }) => {
  const response = await page.goto("/missing-page");
  expect(response?.status()).toBe(404);
  await page.getByRole("link", { name: "العودة للمنتجات" }).click();
  await expect(page).toHaveURL(new URL("/",baseURL).href,{timeout:15000});
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("جملة على قد شغلك.");
});
