import { describe, expect, it } from "vitest";
import { nextOfferDay, offerDate, offerFormSchema } from "@/domain/offers";
const form = { id: "", revision: 0, name: "عرض", scope: "product:20000000-0000-4000-8000-000000000001", customer_phone: "", kind: "percent", value: "10", starts: "2026-11-05", ends: "2026-11-05" };
describe("quantity-independent timed offers", () => {
  it("allows a same-day offer and defaults to no quantity condition", () => expect(offerFormSchema.parse(form).minimum).toBe("1"));
  it("rejects forged quantity tiers", () => expect(offerFormSchema.safeParse({ ...form, minimum: "5" }).success).toBe(false));
  it.each(["product:", "category:invalid", "all:extra", "product:20000000-0000-4000-8000-000000000001:extra"])("rejects unselected or malformed target %s", scope => expect(offerFormSchema.safeParse({ ...form, scope }).success).toBe(false));
  it("rejects invalid and reversed dates", () => {
    expect(offerFormSchema.safeParse({ ...form, ends: "2026-02-30" }).success).toBe(false);
    expect(offerFormSchema.safeParse({ ...form, ends: "2026-11-04" }).success).toBe(false);
  });
  it("converts inclusive days across month and leap-year boundaries", () => {
    expect(nextOfferDay("2026-11-30")).toBe("2026-12-01");
    expect(nextOfferDay("2028-02-28")).toBe("2028-02-29");
    expect(nextOfferDay("2028-02-29")).toBe("2028-03-01");
  });
  it("round-trips exclusive Cairo midnight without changing a saved duration", () => {
    expect(offerDate("2026-11-04T21:59:59Z")).toBe("2026-11-04");
    expect(offerDate("2026-11-04T22:00:00Z")).toBe("2026-11-05");
    expect(offerDate("2026-11-05T22:00:00Z", true)).toBe("2026-11-05");
  });
});
