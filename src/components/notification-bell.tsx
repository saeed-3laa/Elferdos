"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {Icon} from "@/components/icon";
export function NotificationBell(){
 const [summary,setSummary]=useState<{signedIn:boolean;unread:number}|null>(null);
 useEffect(()=>{
  let active=true,latest=0;const controller=new AbortController();
  async function refresh(){if(document.visibilityState!=="visible")return;const current=++latest;try{const response=await fetch("/api/notifications",{cache:"no-store",signal:controller.signal});if(response.ok){const result=await response.json();if(active&&current===latest)setSummary(result);}}catch{/* Retry when the page regains focus. */}}
  void refresh();const timer=setInterval(refresh,30000);window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);window.addEventListener("ferdous-notifications-updated",refresh);
  return()=>{active=false;controller.abort();clearInterval(timer);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);window.removeEventListener("ferdous-notifications-updated",refresh);};
 },[]);
 if(!summary?.signedIn)return null;
 return <Link href="/account/notifications" className="notification-bell" aria-label="إشعارات الطلبات"><Icon name="bell"/><span>الإشعارات</span>{summary.unread>0&&<b aria-live="polite">{summary.unread>=100?"٩٩+":new Intl.NumberFormat("ar-EG").format(summary.unread)}</b>}</Link>;
}
