import { test, expect, type Page } from "@playwright/test";
import { openFrontendFixture, prepareFrontendFixture } from "../helpers/frontend-fixture";
import { measureFrontendContrast } from "../helpers/frontend-contrast";
import { adminItems, existingCart, reorderItems } from "../fixtures/frontend-data";

test.beforeAll(async ({ request }, testInfo) => {
  // Match the web server's startup budget for setup only.
  testInfo.setTimeout(120_000);
  await prepareFrontendFixture(request);
});

const cartKey = "ferdous-cart-v1";
const phase = process.env.FRONTEND_AUDIT_PHASE ?? "after";
async function storedCart(page: Page) { return page.evaluate(key => localStorage.getItem(key), cartKey); }

for (const width of [320, 390, 768, 1440]) {
  test(`F01 admin sections remain reachable by keyboard and touch at ${width}px`, async ({ page, isMobile }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await openFrontendFixture(page, "admin");
    await page.screenshot({ path: testInfo.outputPath(`admin-${phase}.png`), fullPage: true });
    const nav = page.getByRole("navigation", { name: "الإدارة", exact: true });
    const links = nav.getByRole("link");
    await expect(links).toHaveCount(adminItems.length);
    // The desktop brand precedes the links; on phones it is hidden. Reach the
    // first link with the keyboard without assuming identical tab positions.
    for (let step = 0; step < 4; step++) {
      await page.keyboard.press("Tab");
      if (await links.first().evaluate(element => element === document.activeElement)) break;
    }
    for (let index = 0; index < adminItems.length; index++) {
      await expect(links.nth(index)).toBeFocused();
      await expect.poll(() => links.nth(index).evaluate(element => {
        const rect = element.getBoundingClientRect(), container = element.closest(".admin-sidebar")!.getBoundingClientRect();
        return rect.left >= container.left - 1 && rect.right <= container.right + 1 && rect.top >= container.top && rect.bottom <= container.bottom;
      }), { message: `Navigation link ${adminItems[index]!.href} must scroll into view` }).toBe(true);
      const geometry = await links.nth(index).evaluate(element => {
        const rect = element.getBoundingClientRect(), container = element.closest(".admin-sidebar")!.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { visible: rect.left >= container.left - 1 && rect.right <= container.right + 1 && rect.top >= container.top && rect.bottom <= container.bottom,
          outline: style.outlineStyle, width: parseFloat(style.outlineWidth) };
      });
      expect(geometry.visible, `Navigation link ${adminItems[index]!.href} must not be clipped`).toBe(true);
      expect(geometry.outline).toBe("solid");
      expect(geometry.width).toBeGreaterThanOrEqual(3);
      if (index < adminItems.length - 1) await page.keyboard.press("Tab");
    }
    if (isMobile && width <= 768) {
      await nav.evaluate(element => { element.scrollLeft = 0; });
      const bounds = (await nav.boundingBox())!;
      const session = await page.context().newCDPSession(page);
      try {
        for (let swipe = 0; swipe < 14; swipe++) {
          const last = (await links.last().boundingBox())!;
          if (last.x >= bounds.x && last.x + last.width <= bounds.x + bounds.width) break;
          await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: bounds.x + 20, y: bounds.y + 24 }] });
          for (let step = 1; step <= 6; step++) await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: bounds.x + 20 + (bounds.width - 40) * step / 6, y: bounds.y + 24 }] });
          await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        }
        const last = (await links.last().boundingBox())!;
        expect(last.x).toBeGreaterThanOrEqual(bounds.x - 1);
        await expect(links.last()).toBeInViewport();
      } finally { await session.detach(); }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`F02 reorder preserves the full cart until explicit confirmation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(({ key, items }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(items)); }, { key: cartKey, items: existingCart });
    await openFrontendFixture(page, "reorder");
    const original = await storedCart(page);
    const reorder = page.getByRole("button", { name: "إعادة الطلب بأسعار اليوم", exact: true });
    await expect(reorder).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath(`reorder-${phase}.png`), fullPage: true });
    await reorder.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("alertdialog", { name: "استبدال السلة الحالية؟" });
    await expect(dialog).toBeVisible();
    const cancel = dialog.getByRole("button", { name: "الاحتفاظ بالسلة الحالية", exact: true });
    await expect(cancel).toBeFocused();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    expect(await storedCart(page)).toBe(original);
    await page.screenshot({ path: testInfo.outputPath(`reorder-confirmation-${phase}.png`) });
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "استبدال السلة وإعادة الطلب", exact: true })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Enter");
    await expect(dialog).not.toBeVisible();
    await expect(reorder).toBeFocused();
    expect(await storedCart(page)).toBe(original);
    await expect(page.getByTestId("cart-state")).toHaveText(original!);
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(reorder).toBeFocused();
    expect(await storedCart(page)).toBe(original);
    await page.reload();
    await expect(page.getByTestId("cart-state")).toHaveText(original!);
    await page.getByRole("button", { name: "إعادة الطلب بأسعار اليوم", exact: true }).click();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/cart$/);
    expect(JSON.parse((await storedCart(page))!)).toEqual(reorderItems);
  });

  test(`F03 visible store account and admin text meets AA at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const failures: unknown[] = [];
    for (const surface of ["store", "account", "admin"] as const) {
      await openFrontendFixture(page, surface);
      const measurements = await measureFrontendContrast(page);
      await testInfo.attach(`${surface}-contrast-${width}`, { body: JSON.stringify(measurements, null, 2), contentType: "application/json" });
      failures.push(...measurements.text.filter(row => row.ratio < row.minimum).map(row => ({ surface, ...row })));
      await page.screenshot({ path: testInfo.outputPath(`${surface}-contrast-${phase}.png`), fullPage: true });
    }
    expect(failures).toEqual([]);
  });

  test(`F04 form boundaries and keyboard focus meet non-text contrast at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const surface of ["store", "account", "admin"] as const) {
      await openFrontendFixture(page, surface);
      const initial = await measureFrontendContrast(page);
      expect(initial.controls.filter(control => !control.native && (control.borderWidth < 1 || control.borderRatio < 3))).toEqual([]);
      // Start at the document and use only Tab/Shift+Tab to reach inputs,
      // selects, checkboxes, buttons and links, including clipped containers.
      const total = await page.locator('a[href],button:not(:disabled),input:not([type=hidden]):not(:disabled),select:not(:disabled),textarea:not(:disabled),summary').count();
      let focusedControls = 0;
      for (let step = 0; step < total + 2; step++) {
        await page.keyboard.press("Tab");
        const measurements = await measureFrontendContrast(page);
        for (const control of measurements.controls.filter(control => control.focused)) {
          focusedControls++;
          expect(control.outlineWidth, JSON.stringify(control)).toBeGreaterThanOrEqual(3);
          expect(control.outlineRatio, JSON.stringify(control)).toBeGreaterThanOrEqual(3);
        }
      }
      expect(focusedControls).toBeGreaterThan(0);
      const firstInput = page.locator('input:not([type=hidden]):not(:disabled)').first();
      await firstInput.focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      await expect(firstInput).toBeFocused();
      await page.screenshot({ path: testInfo.outputPath(`${surface}-focus-${phase}.png`), fullPage: true });
      await testInfo.attach(`${surface}-controls-${width}`, { body: JSON.stringify(await measureFrontendContrast(page), null, 2), contentType: "application/json" });
    }
  });
}

test("F02 an empty cart can reorder without a replacement warning", async ({ page }) => {
  await openFrontendFixture(page, "reorder");
  await page.getByRole("button", { name: "إعادة الطلب بأسعار اليوم", exact: true }).click();
  await expect(page).toHaveURL(/\/cart$/);
  expect(JSON.parse((await storedCart(page))!)).toEqual(reorderItems);
});
