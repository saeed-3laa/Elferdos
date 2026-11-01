import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, SUPABASE_SERVICE_ROLE_KEY: serviceKey } = process.env;
if (!url || !key || !serviceKey || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
  throw new Error("This test only runs against a LOCAL development Supabase with all three keys configured.");
}
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
};
const admin = createClient(url, serviceKey, options);
const alice = createClient(url, key, options);
const bob = createClient(url, key, options);
const createdUsers = [];

try {
  const publicClient = createClient(url, key, options);
  const catalog = await publicClient.rpc("browse_catalog", { p_limit: 25 });
  assert.equal(catalog.error, null, "Public catalogue RPC must work through PostgREST");
  assert.ok(Array.isArray(catalog.data), "Catalogue must return a real array");
  assert.ok(catalog.data.some((item) => item.sku === "DEMO-DRINK"), "Local fictional seed must be loaded");
  assert.ok(catalog.data.every((item) => !("quantity_pieces" in item)), "Public catalogue must not disclose exact inventory");
  const passwords = [randomUUID() + "Aa1!", randomUUID() + "Aa1!"];
  const phones = [`+2010${randomInt(10000000, 99999999)}`, `+2011${randomInt(10000000, 99999999)}`];
  for (const [i, client] of [alice, bob].entries()) {
    const { data, error } = await client.auth.signUp({ phone: phones[i], password: passwords[i], options: { data: { full_name: "عميل اختبار محلي", shop_name: "محل خيالي" } } });
    assert.equal(error, null, "Phone/password signup failed");
    assert.ok(data.user?.id, "Signup must create a user");
    createdUsers.push(data.user.id);
    assert.ok(data.session, "Local phone confirmations must be disabled; this test sends no SMS");
  }
  const own = await alice.from("profiles").select("id");
  assert.equal(own.error, null);
  assert.deepEqual(own.data, [{ id: createdUsers[0] }]);
  const other = await bob.from("profiles").select("id").eq("id", createdUsers[0]);
  assert.equal(other.error, null);
  assert.deepEqual(other.data, []);
  const wrongLogin = await createClient(url, key, options).auth.signInWithPassword({ phone: phones[0], password: "incorrect-password" });
  assert.ok(wrongLogin.error, "Wrong password must fail");
  const correctLogin = await createClient(url, key, options).auth.signInWithPassword({ phone: phones[0], password: passwords[0] });
  assert.equal(correctLogin.error, null, "Phone/password login must work before a reset");
  const newPassword = randomUUID() + "Aa1!";
  const reset = await admin.auth.admin.updateUserById(createdUsers[0], { password: newPassword });
  assert.equal(reset.error, null, "Administrative reset failed");
  const oldLogin = await createClient(url, key, options).auth.signInWithPassword({ phone: phones[0], password: passwords[0] });
  assert.ok(oldLogin.error, "Old password must fail after reset");
  const newLogin = await createClient(url, key, options).auth.signInWithPassword({ phone: phones[0], password: newPassword });
  assert.equal(newLogin.error, null, "New password should authenticate");
  console.log("PASS: live PostgREST catalogue, phone signup/login, wrong password rejection, profile isolation, administrative password update.");
} finally {
  // Only the ephemeral users created by this local-only test are removed.
  for (const id of createdUsers.reverse()) {
    const profileRemoval = await admin.from("profiles").delete().eq("id", id);
    assert.equal(profileRemoval.error, null, "Local test profile cleanup failed");
    const userRemoval = await admin.auth.admin.deleteUser(id);
    assert.equal(userRemoval.error, null, "Local test user cleanup failed");
  }
}
