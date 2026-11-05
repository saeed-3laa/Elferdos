import { z } from "zod";

export const offerScopeSchema = z.union([z.literal("all"), z.string().regex(/^(product|category|unit):[0-9a-f-]+$/i).refine(value => z.uuid().safeParse(value.split(":")[1]).success)]);
export const offerFormSchema = z.object({
  id: z.union([z.uuid(), z.literal("")]), revision: z.coerce.number().int().nonnegative(),
  name: z.string().trim().min(1).max(160), scope: offerScopeSchema,
  customer_phone: z.string().trim(), minimum: z.literal("1").default("1"),
  kind: z.enum(["fixed", "percent"]), value: z.string(), starts: z.iso.date(), ends: z.iso.date(),
}).refine(data => data.ends >= data.starts && data.ends < "9999-12-31", { message: "INVALID_OFFER_DATES" });

/** Form end date is inclusive; PostgreSQL retains its exclusive UTC timestamp contract. */
export function nextOfferDay(day: string) {
  const date = new Date(`${z.iso.date().parse(day)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
export function offerDate(value: string, exclusiveEnd = false) {
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
  if (!exclusiveEnd) return local;
  const day = new Date(`${local}T00:00:00Z`); day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}
