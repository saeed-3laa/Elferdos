import {z} from "zod";
export const cartSchema=z.array(z.object({unit_id:z.uuid(),quantity:z.number().int().min(1).max(100000),name:z.string().max(200).optional(),unit_name:z.string().max(80).optional(),minimum_quantity:z.number().int().min(1).max(100000).optional()})).max(100);
export type CartItem=z.infer<typeof cartSchema>[number];
export const quoteSchema=z.object({lines:z.array(z.object({unit_id:z.uuid(),product_id:z.uuid(),name:z.string(),sku:z.string(),category_name:z.string(),unit_name:z.string(),pieces_per_unit:z.number(),quantity:z.number(),base_price:z.number(),unit_price:z.number(),line_total:z.number(),rule_id:z.string().nullable(),price_label:z.string()})),base_total:z.number(),subtotal:z.number(),delivery_fee:z.number(),total:z.number(),address:z.object({id:z.uuid(),address:z.string(),notes:z.string(),zone:z.string(),zone_id:z.uuid(),fee:z.number()})});
export type OrderQuote=z.infer<typeof quoteSchema>;
export const statusLabels:Record<string,string>={CONFIRMED:"مؤكد",READY:"جاهز",DELIVERED:"تم التسليم"};
export function orderStatusLabel(status:string){return statusLabels[status]??({NEW:"مؤكد",PREPARING:"مؤكد",OUT_FOR_DELIVERY:"جاهز",CANCELLED:"ملغي"} as Record<string,string>)[status]??status;}
export type OrderStatus=keyof typeof statusLabels;
export const nextStatus:Record<string,string|undefined>={CONFIRMED:"READY",READY:"DELIVERED"};
export const amendmentItemsSchema=z.array(z.object({unit_id:z.uuid(),quantity:z.number().int().min(0).max(100000)})).min(1).max(100);
const amendmentTotals=z.object({base_total:z.number().int().nonnegative(),subtotal:z.number().int().nonnegative(),delivery_fee:z.number().int().nonnegative(),total:z.number().int().nonnegative(),status:z.string()}).passthrough();
export const amendmentQuoteSchema=z.object({before:amendmentTotals,after:amendmentTotals,changes:z.array(z.object({unit_id:z.uuid(),name:z.string(),sku:z.string(),unit:z.string(),before:z.number().int(),after:z.number().int(),unit_price:z.number().int()})),paid:z.number().int().nonnegative()});
export type AmendmentQuote=z.infer<typeof amendmentQuoteSchema>;
export function orderError(message?:string) {
 const errors:Record<string,string>={INVALID_ADDRESS:"اختار عنوانًا محفوظًا ضمن منطقة توصيل مفعّلة.",INVALID_QUANTITY:"راجع الكميات والحد الأدنى لكل وحدة.",PRODUCT_UNAVAILABLE:"أحد المنتجات غير متاح الآن.",QUOTE_CHANGED:"السعر أو بيانات التوصيل اتغيرت. حدّث الحساب وراجع الإجمالي قبل الإرسال.",IDEMPOTENCY_CONFLICT:"بيانات المحاولة اتغيرت. راجع الطلب وأعد الإرسال.",INVALID_TRANSITION:"لا يمكن الانتقال لهذه الحالة.",EDIT_CONFLICT:"الطلب اتغير. حدّث الصفحة قبل التعديل.",INVALID_PAYMENT:"راجع المبلغ؛ لا يمكن تجاوز إجمالي الطلب أو رد أكثر من المحصل.",PAYMENT_REQUIRES_REFUND:"سجّل رد المبلغ المحصل قبل إلغاء الطلب."};
 if(message?.includes("ORDER_RATE_LIMIT"))return "وصلت لحد الطلبات في الساعة. حاول لاحقًا.";
 const amendmentErrors:Record<string,string>={ORDER_NOT_EDITABLE:"لا يمكن تعديل طلب تم التسليم أو إلغاؤه.",EMPTY_ORDER:"لازم يفضل صنف واحد على الأقل في الطلب.",NO_ORDER_CHANGES:"لم تتغير الأصناف أو الكميات.",INVALID_ORDER_ITEM:"اختر من أصناف الطلب الحالي فقط.",AMENDMENT_REQUIRES_REFUND:"الإجمالي الجديد أقل من المبلغ المحصل. سجّل رد الفرق أولًا ثم أعد التعديل.",AMENDMENT_LIMIT:"وصل الطلب لحد التعديلات المسموح.",PAYMENT_REQUIRED:"لا يمكن إتمام الطلب قبل تأكيد تحصيل كامل المبلغ."};
 const specific=Object.entries(amendmentErrors).find(([key])=>message?.includes(key));if(specific)return specific[1];
 return Object.entries(errors).find(([key])=>message?.includes(key))?.[1] ?? "تعذّر تنفيذ العملية. راجع البيانات والصلاحيات وحاول مرة أخرى.";
}
