import { z } from "zod";

export const moneySchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export function formatEgp(piastres: number): string {
  moneySchema.parse(piastres);
  return new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP" }).format(piastres / 100);
}

export function deliveryFee(subtotal: number, zoneFee: number, freeAbove = 0): number {
  [subtotal, zoneFee, freeAbove].forEach((value) => moneySchema.parse(value));
  return 0;
}

export function wholesalePieces(quantity: number, piecesPerUnit: number): number {
  const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
  positiveInteger.parse(quantity);
  positiveInteger.min(2).parse(piecesPerUnit);
  return positiveInteger.parse(quantity * piecesPerUnit);
}
