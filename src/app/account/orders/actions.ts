"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {requireCustomer} from "@/server/auth/customer";
import {orderError} from "@/domain/orders";
import type {FormState} from "@/domain/accounts";
export async function cancelMyOrder(_state:FormState,form:FormData):Promise<FormState>{
 const {client}=await requireCustomer();const parsed=z.object({order:z.uuid(),revision:z.coerce.number().int().nonnegative(),confirmed:z.literal("on")}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:"أكد إلغاء الطلب أولًا."};
 const result=await client.rpc("cancel_customer_order",{p_order:parsed.data.order,p_revision:parsed.data.revision});
 if(result.error)return {error:result.error.message.includes("ORDER_NOT_CANCELLABLE")?"الطلب اتجهّز بالفعل؛ لم يعد متاحًا إلغاؤه من الحساب.":orderError(result.error.message)};
 revalidatePath("/account/orders","layout");revalidatePath("/admin/orders","layout");revalidatePath("/");return {success:"تم إلغاء الطلب"};
}
