"use client";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {markRead} from "@/app/account/notifications/actions";
export function ReadNotification({id}:{id:string}){
 const [pending,start]=useTransition(),[error,setError]=useState("");const router=useRouter();
 return <><button className="text-button" disabled={pending} onClick={()=>start(async()=>{setError("");try{const result=await markRead(id);if(result.error)setError(result.error);else{window.dispatchEvent(new Event("ferdous-notifications-updated"));router.refresh();}}catch{setError("تعذّر تحديث الإشعار. حاول مرة أخرى.");}})}>{pending?"جارٍ التحديث…":"تحديد كمقروء"}</button>{error&&<p role="alert">{error}</p>}</>;
}
