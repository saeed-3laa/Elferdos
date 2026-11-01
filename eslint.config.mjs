import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import ts from "typescript-eslint";
import next from "@next/eslint-plugin-next";
import globals from "globals";

export default defineConfig([
  js.configs.recommended,
  ...ts.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  { files: ["src/**/*.{ts,tsx}"], plugins: { "@next/next": next }, rules: {
    ...next.configs.recommended.rules,
    ...next.configs["core-web-vitals"].rules,
  } },
  globalIgnores([".next/**", ".work/**", "coverage/**", "playwright-report/**", "test-results/**", "next-env.d.ts"]),
]);
