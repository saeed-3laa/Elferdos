import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/server/config";
import { contentSecurityPolicy } from "@/domain/security-headers";

export async function proxy(request: NextRequest) {
 const config=getSupabaseConfig();
 const nonce=Buffer.from(crypto.randomUUID()).toString("base64");
 const policy=contentSecurityPolicy({nonce,supabaseUrl:config?.url,development:process.env.NODE_ENV!=="production",https:request.nextUrl.protocol==="https:"});
 function next(){
  const headers=new Headers(request.headers);headers.set("x-nonce",nonce);headers.set("Content-Security-Policy",policy);
  const response=NextResponse.next({request:{headers}});response.headers.set("Content-Security-Policy",policy);response.headers.set("Cache-Control","private, no-store");return response;
 }
 let response=next();
 if(!config||!request.cookies.getAll().some(({name})=>name.startsWith("sb-")))return response;
 const client=createServerClient(config.url,config.key,{
  cookieOptions:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/"},
  global:{fetch:(input,init)=>fetch(input,{...init,cache:"no-store",signal:AbortSignal.timeout(10000)})},
  cookies:{getAll:()=>request.cookies.getAll(),setAll:(values,cacheHeaders)=>{
   values.forEach(({name,value})=>request.cookies.set(name,value));response=next();
   values.forEach(({name,value,options})=>response.cookies.set(name,value,options));
   Object.entries(cacheHeaders).forEach(([key,value])=>response.headers.set(key,value));response.headers.set("Cache-Control","private, no-store");
  }},
 });
 try{await client.auth.getClaims();}catch{/* The data-access boundary fails closed. */}
 return response;
}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico).*)"]};
