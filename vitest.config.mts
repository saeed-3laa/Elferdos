import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "server-only":fileURLToPath(new URL("./tests/helpers/server-only.ts",import.meta.url)), "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"], testTimeout: 30000, hookTimeout: 60000 },
});
