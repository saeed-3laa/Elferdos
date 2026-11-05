import { test, expect } from "@playwright/test";
import { openOffersFixture } from "../helpers/offers-fixture";

test("searches offer products and categories, selects with keyboard and invalidates edited selections", async ({ page }, info) => {
  await openOffersFixture(page, "pricing");
  const product = "20000000-0000-4000-8000-000000000001", category = "10000000-0000-4000-8000-000000000001";
  await page.route("**/api/pricing-targets?*", route => {
    const q = new URL(route.request().url()).searchParams;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: q.get("q") === "غير موجود" ? [] : [{ id: q.get("kind") === "category" ? category : product, label: q.get("kind") === "category" ? "مشروبات" : "منتج عرض تجريبي", detail: "DEMO-001" }] }) });
  });
  await expect(page.locator('input[name="minimum"]')).toHaveCount(0);
  await page.getByRole("combobox", { name: "العرض على", exact: true }).selectOption("product");
  const input = page.getByRole("combobox", { name: "ابحث عن المنتج", exact: true });
  await input.fill("م");
  await expect(page.getByRole("option", { name: /منتج عرض تجريبي/ })).toBeVisible();
  await input.press("ArrowDown"); await input.press("Enter");
  await expect(page.locator('input[name="scope"]')).toHaveValue(`product:${product}`);
  await input.fill("غير موجود");
  await expect(page.locator('input[name="scope"]')).toHaveValue("product:");
  await expect(page.getByRole("status")).toContainText("لا توجد نتائج");
  await page.getByRole("combobox", { name: "العرض على", exact: true }).selectOption("category");
  const categories = page.getByRole("combobox", { name: "ابحث عن القسم", exact: true });
  await categories.fill("مش");
  await page.getByRole("option", { name: /مشروبات/ }).click();
  await expect(page.locator('input[name="scope"]')).toHaveValue(`category:${category}`);
  await expect(page.getByLabel("إلى نهاية يوم (القاهرة)")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("offer-search.png"), fullPage: true });
});

test("puts genuine offers in a distinct shelf with savings and preserves the closed cart", async ({ page }, info) => {
  await openOffersFixture(page, "store");
  const shelf = page.getByRole("region", { name: "عروض سارية لمحلك" });
  await expect(shelf.getByRole("article")).toHaveCount(1);
  await expect(shelf.locator("del")).toBeVisible();
  await expect(shelf.locator(".offer-saving")).toContainText("وفّر");
  await expect(page.getByRole("article")).toHaveCount(2);
  await shelf.hover();
  await shelf.getByRole("button", { name: "إضافة للسلة", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "سلتك", exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "قائمة مختصرة", exact: true }).click();
  await expect(page.locator(".catalog-results")).toHaveAttribute("data-view", "list");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("timed-offers-store.png"), fullPage: true });
});
