import "server-only";
import { z } from "zod";

const publicConfigSchema = z.object({
  url: z.url().refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
    } catch { return false; }
  }),
  key: z.string().trim().min(20),
});

export function getSupabaseConfig() {
  const result = publicConfigSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return result.success ? result.data : null;
}
