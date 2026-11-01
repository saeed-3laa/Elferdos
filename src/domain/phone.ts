import { z } from "zod";

export const egyptianPhoneSchema = z.string().trim().max(32).transform((value) =>
  value.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[\s()-]/g, "")
    .replace(/^0020/, "+20")
    .replace(/^01/, "+201"),
).pipe(z.string().regex(/^\+201[0125]\d{8}$/, "اكتب رقم موبايل مصري صحيح"));
