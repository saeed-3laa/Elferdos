import {describe,it,expect} from "vitest";
import {deliveryChoices,formatDeliveryDate} from "../../src/domain/delivery";
describe("Cairo delivery days",()=>{
 it("uses the Cairo day when the UTC calendar day is still yesterday",()=>expect(deliveryChoices(new Date('2026-10-28T21:30:00Z')).map(c=>c.date)).toEqual(['2026-10-29','2026-10-30','2026-10-31']));
 it("moves calendar days across the year boundary",()=>expect(deliveryChoices(new Date('2026-12-31T23:30:00Z')).map(c=>c.date)).toEqual(['2027-01-01','2027-01-02','2027-01-03']));
 it("keeps the saved day independent of rendering-machine time zone",()=>expect(formatDeliveryDate('2026-10-29')).toContain('٢٩'));
});
