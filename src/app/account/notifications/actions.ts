"use server";
import {revalidatePath} from "next/cache";
import {requireCustomer} from "@/server/auth/customer";
export async function markRead(id:string){
 const {client}=await requireCustomer();if(!/^\d{1,15}$/.test(id))return {error:"إشعار غير صالح"};
 const result=await client.rpc("mark_notification_read",{p_id:id});if(result.error)return {error:"تعذّر تحديث الإشعار"};
 revalidatePath("/account/notifications");return {success:true};
}
