import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { APIRequestContext, Page } from "@playwright/test";

async function componentBundle() {
  // Vite is already supplied by the locked Vitest installation. No test routes
  // or test-only authorization paths are added to the production application.
  const config = {
    configFile: false, logLevel: "error",
    resolve: { alias: [
      { find: "next/navigation", replacement: path.resolve("tests/fixtures/frontend-navigation.ts") },
      { find: "next/link", replacement: path.resolve("tests/fixtures/frontend-link.tsx") },
      { find: "next/image", replacement: path.resolve("tests/fixtures/frontend-image.tsx") },
      { find: /^@\/app\/.*actions$/, replacement: path.resolve("tests/fixtures/frontend-actions.ts") },
      { find: "@", replacement: path.resolve("src") },
    ] },
    define: { "process.env.NODE_ENV": JSON.stringify("production"), "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify("") },
    build: { write: false, minify: false, lib: { entry: path.resolve("tests/fixtures/frontend.tsx"), formats: ["iife"], name: "FrontendFixture" } },
  };
  // Keep Vite's native build workers out of the Playwright worker lifetime.
  // The subprocess exits only after the complete in-memory bundle is flushed.
  const script = `
    import { build } from "vite";
    try {
      const config = ${JSON.stringify(config)};
      config.resolve.alias[3].find = /^@\\/app\\/.*actions$/;
      const result = await build(config);
      const outputs = (Array.isArray(result) ? result : [result]).flatMap(output => "output" in output ? output.output : []);
      const entry = outputs.find(chunk => chunk.type === "chunk" && chunk.isEntry);
      if (!entry) throw new Error("Frontend fixture bundle was not generated");
      process.stdout.write(entry.code, () => process.exit(0));
    } catch (error) { console.error(error); process.exit(1); }
  `;
  const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", script], { maxBuffer: 4 * 1024 * 1024 });
  return stdout;
}

let fixture: Promise<{ code: string; styles: string }> | undefined;

async function loadFixtureStyles(request: APIRequestContext) {
  const home = await request.get("/");
  if (!home.ok()) throw new Error(`Fixture stylesheet source returned HTTP ${home.status()}`);
  const styles = ((await home.text()).match(/<link\b[^>]*>/g) ?? [])
    .filter(link => /\srel="stylesheet"/.test(link)).join("");
  if (!styles) throw new Error("Fixture stylesheet source contained no stylesheet links");

  // Reorder navigates to the real cart page. Compile that route in setup, too.
  const cart = await request.get("/cart");
  if (!cart.ok()) throw new Error(`Fixture cart route returned HTTP ${cart.status()}`);
  return styles;
}

export async function prepareFrontendFixture(request: APIRequestContext) {
  fixture ??= Promise.all([componentBundle(), loadFixtureStyles(request)])
    .then(([code, styles]) => ({ code, styles }));
  await fixture;
}

export async function openFrontendFixture(page: Page, surface: "admin" | "store" | "account" | "reorder") {
  if (!fixture) throw new Error("Call prepareFrontendFixture before opening a fixture");
  const { code, styles } = await fixture;
  await page.route("**/__frontend-fixture.js", route => route.fulfill({ contentType: "application/javascript; charset=utf-8", body: code }));
  await page.route("**/__frontend-fixture?*", route => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styles}</head><body><div id="fixture-root"></div><script src="/__frontend-fixture.js"></script></body></html>`,
  }));
  await page.goto(`/__frontend-fixture?surface=${surface}`);
  await page.locator("main h1").waitFor();
  await page.evaluate(() => document.fonts.ready);
}
