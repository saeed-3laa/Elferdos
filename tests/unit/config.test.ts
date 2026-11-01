import { afterEach, expect, it, vi } from "vitest";
import { getSupabaseConfig } from "@/server/config";

afterEach(() => vi.unstubAllEnvs());
it("reports missing configuration instead of simulating a connection", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
  expect(getSupabaseConfig()).toBeNull();
});
it("rejects insecure remote endpoints", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://example.com");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "a".repeat(40));
  expect(getSupabaseConfig()).toBeNull();
});
it("allows the local Supabase development endpoint", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "a".repeat(40));
  expect(getSupabaseConfig()?.url).toBe("http://127.0.0.1:54321");
});
