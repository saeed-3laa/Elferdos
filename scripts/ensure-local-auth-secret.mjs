import { randomBytes } from "node:crypto";
import { appendFile } from "node:fs/promises";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
  throw new Error("Only local development configuration may be updated by this helper.");
}
if (process.env.AUTH_RATE_LIMIT_SECRET) {
  if (process.env.AUTH_RATE_LIMIT_SECRET.length < 32) throw new Error("Existing auth limit secret is too short; replace it manually.");
  console.log("Local auth limit secret already configured; unchanged.");
} else {
  await appendFile(".env.local", `\nAUTH_RATE_LIMIT_SECRET=${randomBytes(32).toString("hex")}\n`, { encoding: "utf8", mode: 0o600 });
  console.log("Local auth limit secret added to ignored .env.local. No secrets printed.");
}
