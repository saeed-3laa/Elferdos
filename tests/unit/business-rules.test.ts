import { describe, expect, it } from "vitest";
import { deliveryFee, formatEgp, wholesalePieces } from "@/domain/money";
import { egyptianPhoneSchema } from "@/domain/phone";

describe("delivery fee in integer piastres", () => {
  it.each([[0, 0], [199999, 0], [200000, 0], [200001, 0]])("subtotal %i gives fee %i", (subtotal, expected) => {
    expect(deliveryFee(subtotal, 4500)).toBe(expected);
  });
  it("ignores retired thresholds because delivery is always free", () => expect(deliveryFee(200001, 4500, 300000)).toBe(0));
  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid money %s", (value) => {
    expect(() => deliveryFee(value, 4500)).toThrow();
  });
  it("validates the zone fee and threshold even when delivery is free", () => {
    expect(() => deliveryFee(300000, -1)).toThrow();
    expect(() => deliveryFee(300000, 100, -1)).toThrow();
  });
  it("formats EGP without losing a piastre", () => expect(formatEgp(200001)).toContain("٠١"));
});

describe("wholesale units", () => {
  it("rejects single-piece sale units", () => expect(() => wholesalePieces(3, 1)).toThrow());
  it("converts full cartons into internal pieces", () => expect(wholesalePieces(3, 48)).toBe(144));
  it.each([0, -1, 0.5, NaN])("rejects invalid order quantity %s", (quantity) => expect(() => wholesalePieces(quantity, 24)).toThrow());
  it("rejects unsafe arithmetic", () => expect(() => wholesalePieces(Number.MAX_SAFE_INTEGER, 24)).toThrow());
});

describe("Egyptian mobile identity", () => {
  it.each(["01012345678", "+201012345678", "00201012345678", "٠١٠١٢٣٤٥٦٧٨", "010 1234 5678"])("normalizes %s", (input) => {
    expect(egyptianPhoneSchema.parse(input)).toBe("+201012345678");
  });
  it.each(["0123", "+12025550123", "01912345678", "text", "010123456789"])("rejects %s", (input) => {
    expect(egyptianPhoneSchema.safeParse(input).success).toBe(false);
  });
});
