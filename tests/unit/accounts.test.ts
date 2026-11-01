import { describe, it, expect } from "vitest";
import { registrationSchema, profileSchema, loginSchema, addressSchema } from "@/domain/accounts";

const valid = {
  full_name: "عميل اختبار خيالي", shop_name: "محل تجريبي", delivery_address: "عنوان خيالي تفصيلي داخل الإسكندرية",
  area: "منطقة تجريبية", delivery_notes: "", phone: "01012345678",
  password: "test-password-1234", confirm_password: "test-password-1234",
};
describe("account validation", () => {
  it("requires a complete shop profile and normalizes the mobile", () => expect(registrationSchema.parse(valid).phone).toBe("+201012345678"));
  it.each(["full_name", "shop_name", "delivery_address", "area"] as const)("rejects missing %s", (field) => expect(registrationSchema.safeParse({ ...valid, [field]: "" }).success).toBe(false));
  it("rejects mismatched passwords", () => expect(registrationSchema.safeParse({ ...valid, confirm_password: "different-password" }).success).toBe(false));
  it("rejects a short registration password", () => expect(registrationSchema.safeParse({ ...valid, password: "short", confirm_password: "short" }).success).toBe(false));
  it("allows existing accounts to sign in with their existing shorter password", () => expect(loginSchema.safeParse({ phone: valid.phone, password: "existing" }).success).toBe(true));
  it("strips protected profile fields", () => {
    const profile = profileSchema.parse({ ...valid, id: "forged", active: true, role: "OWNER" });
    expect(profile).not.toHaveProperty("role");
    expect(profile).not.toHaveProperty("id");
    expect(profile).not.toHaveProperty("active");
    expect(profile).not.toHaveProperty("password");
  });
  it("rejects a forged address identifier", () => expect(addressSchema.safeParse({ id: "forged", zone_id: "forged", address: valid.delivery_address, notes: "", is_default: false }).success).toBe(false));
});
