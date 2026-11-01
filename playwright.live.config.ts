import { defineConfig, devices } from "@playwright/test";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
  throw new Error("Live catalogue tests require the LOCAL Supabase development stack.");
}

export default defineConfig({
  outputDir:"test-results/live",
  timeout: 60000,
  expect: { timeout: 10000 },
  workers: 2,
  testDir: "./tests/e2e-live",
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3200", trace: "retain-on-failure" },
  projects: [
    { name: "desktop-live", use: { ...devices["Desktop Chrome"] } },
    { name: "android-live", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    env:{APP_ORIGIN:"http://127.0.0.1:3200"},
    command: process.env.E2E_PRODUCTION === "1"
      ? "npm run start -- --hostname 127.0.0.1 --port 3200"
      : "npm run dev -- --hostname 127.0.0.1 --port 3200",
    url: "http://127.0.0.1:3200",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
