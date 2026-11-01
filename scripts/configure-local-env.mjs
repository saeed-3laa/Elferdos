import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

// Capture local credentials in memory, never print CLI status or keys.
const cli = fileURLToPath(new URL("../node_modules/supabase/dist/supabase.js", import.meta.url));
let status;
try {
  const output = execFileSync(process.execPath, [cli, "status", "--output", "json"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000,
  });
  status = JSON.parse(output);
} catch {
  console.error("Local Supabase status is unavailable. Start Docker and the project stack first. No keys were printed.");
  process.exit(1);
}
const url = status.API_URL;
const publicKey = status.PUBLISHABLE_KEY || status.ANON_KEY;
const serverKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
if (typeof url !== "string" || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)
  || typeof publicKey !== "string" || typeof serverKey !== "string"
  || [url, publicKey, serverKey].some((value) => /[\r\n]/.test(value))) {
  throw new Error("Expected safe local Supabase configuration. Nothing written.");
}
const content = [
  "# Local development credentials. Ignored by Git. Never use for production.",
  `NEXT_PUBLIC_SUPABASE_URL=${url}`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publicKey}`,
  `SUPABASE_SERVICE_ROLE_KEY=${serverKey}`,
  `AUTH_RATE_LIMIT_SECRET=${randomBytes(32).toString("hex")}`,
  "BOOTSTRAP_OWNER_USER_ID=", "",
].join("\n");
try {
  await writeFile(new URL("../.env.local", import.meta.url), content, { encoding: "utf8", flag: "wx", mode: 0o600 });
  console.log("Created ignored .env.local for the local stack. No credentials printed. Restart Next.js to load it.");
} catch (error) {
  if (error.code === "EEXIST") {
    console.error(".env.local already exists; left unchanged. Configure it manually or preserve it before replacing.");
    process.exit(1);
  }
  throw error;
}
