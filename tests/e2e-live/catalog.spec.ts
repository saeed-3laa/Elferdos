import { test, expect } from "@playwright/test";

test("renders actual local database products and wholesale units", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "مشروب تجريبي — بيانات خيالية" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "مقرمشات تجريبية — بيانات خيالية" })).toBeVisible();
  await expect(page.getByText("الكتالوج قيد التجهيز")).toHaveCount(0);
  await expect(page.getByRole("article").filter({ hasText: "DEMO-DRINK" })).toContainText("بالتة");
  await expect(page.getByRole("article").filter({ hasText: "DEMO-SNACK" })).toContainText("كرتونة");
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("connected-catalog.png"), fullPage: true });
});

test("searches the real catalogue by SKU and displays genuine empty results", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "ابحث عن منتج" }).fill("DEMO-DRINK");
  await page.getByRole("button", { name: "بحث", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText("DEMO-DRINK");
  await page.getByRole("combobox", { name: "ابحث عن منتج" }).fill("NO-SUCH-FICTIONAL-SKU");
  await page.getByRole("button", { name: "بحث", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("لا توجد منتجات مطابقة");
  await page.getByRole("link", { name: "عرض جميع المنتجات" }).click();
  await expect(page.getByRole("heading", { name: "مشروب تجريبي — بيانات خيالية" })).toBeVisible();
});

test("suggests from the first letter, supports keyboard choice and hides private scopes", async ({ page }, testInfo) => {
  await page.goto("/");
  const input = page.getByRole("combobox", {name:"ابحث عن منتج"});
  await input.fill("م");
  await expect(page.getByRole("option").filter({hasText:"DEMO-DRINK"})).toBeVisible();
  await input.fill("مش");
  await expect(page.getByRole("option").filter({hasText:"DEMO-DRINK"})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("search-suggestions.png"),fullPage:true});
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(page).toHaveURL(/q=DEMO-DRINK/);
  await expect(page.getByRole("article")).toHaveCount(1);
  await input.fill("م");
  await expect(page.getByRole("listbox")).toBeVisible();
  await input.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await input.fill("");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  expect((await page.request.get("/api/search?scope=customers&q=م")).status()).toBe(403);
  expect((await page.request.get("/api/search?scope=orders&q=1")).status()).toBe(403);
});
