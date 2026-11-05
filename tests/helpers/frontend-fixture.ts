import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Page } from "@playwright/test";

let bundle: Promise<string> | undefined;
function componentBundle() {
  return bundle ??= (async () => {
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
  })();
}

export async function openFrontendFixture(page: Page, surface: "admin" | "store" | "account" | "reorder") {
  const code = await componentBundle();
  await page.goto("/");
  await page.locator("main h1").waitFor();
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll(elements => elements.map(element => element.outerHTML).join(""));
  await page.route("**/__frontend-fixture.js", route => route.fulfill({ contentType: "application/javascript; charset=utf-8", body: code }));
  await page.route("**/__frontend-fixture?*", route => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styles}</head><body><div id="fixture-root"></div><script src="/__frontend-fixture.js"></script></body></html>`,
  }));
  await page.goto(`/__frontend-fixture?surface=${surface}`);
  await page.locator("main h1").waitFor();
  await page.evaluate(() => document.fonts.ready);
}
