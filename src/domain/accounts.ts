import { z } from "zod";
import { egyptianPhoneSchema } from "@/domain/phone";

export const profileSchema = z.object({
  full_name: z.string().trim().min(3, "اكتب الاسم بالكامل").max(160),
  shop_name: z.string().trim().min(2, "اكتب اسم المحل").max(160),
  delivery_address: z.string().trim().min(10, "اكتب عنوانًا تفصيليًا").max(1000),
  area: z.string().trim().min(2, "اكتب المنطقة داخل الإسكندرية").max(100),
  delivery_notes: z.string().trim().max(1000, "الملاحظات أطول من المسموح"),
});
export const loginSchema = z.object({
  phone: egyptianPhoneSchema,
  password: z.string().min(1, "اكتب كلمة المرور").max(128),
});
export const registrationSchema = profileSchema.extend({
  phone: egyptianPhoneSchema,
  password: z.string().min(12, "كلمة المرور لا تقل عن ١٢ حرفًا").max(128),
  confirm_password: z.string(),
}).refine((data) => data.password === data.confirm_password, { message: "كلمتا المرور غير متطابقتين", path: ["confirm_password"] });
export const addressSchema = z.object({
  id: z.union([z.literal(""), z.uuid()]),
  zone_id: z.uuid("اختر منطقة توصيل"),
  address: z.string().trim().min(10, "اكتب عنوانًا تفصيليًا").max(1000),
  notes: z.string().trim().max(1000),
  is_default: z.boolean(),
});
export type FormState = { error?: string; success?: string };
