import {randomInt,randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {test,expect} from "@playwright/test";

for(const legacy of [false,true])test(`${legacy?"legacy staff":"initial phone owner"} adopts an email only after opening the captured verification message`,async({page,baseURL})=>{
 test.setTimeout(90000);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;if(!["localhost","127.0.0.1"].includes(new URL(url).hostname))throw new Error("Local identity/mailbox tests only");
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const phone=`+2015${randomInt(10000000,99999999)}`,password=randomUUID()+"Aa1!",email=`transition-${randomUUID()}@example.test`;
 const created=await admin.auth.admin.createUser({phone,password,phone_confirm:true,user_metadata:{full_name:"اختبار تحويل البريد"}});expect(created.error).toBeNull();const id=created.data.user!.id;
 try{
  expect((await admin.from("staff_assignments").insert({user_id:id,role:"OWNER"})).error).toBeNull();if(legacy)expect((await admin.from("profiles").update({legacy_staff_login:true}).eq("id",id)).error).toBeNull();
  await page.goto("/login");await page.getByLabel("رقم الموبايل",{exact:true}).filter({visible:true}).fill(phone);await page.getByLabel("كلمة المرور",{exact:true}).filter({visible:true}).fill(password);await page.getByRole("button",{name:"تسجيل الدخول",exact:true}).click();await expect(page).toHaveURL(legacy?/\/admin$/:/\/security\/email$/);
  await page.goto("/security/email");await page.getByLabel("البريد الإلكتروني",{exact:true}).filter({visible:true}).fill(email);await page.getByLabel("كلمة المرور الحالية",{exact:true}).filter({visible:true}).fill(password);await page.getByRole("button",{name:"إرسال رابط تأكيد البريد",exact:true}).click();await expect(page.getByRole("status")).toContainText("تم طلب التحقق");
  expect((await admin.auth.admin.getUserById(id)).data.user?.email_confirmed_at).toBeFalsy();
  let messageId="";
  await expect.poll(async()=>{const result=await fetch("http://127.0.0.1:54324/api/v1/messages?limit=100");const list=await result.json();messageId=list.messages?.find((m:{ID:string;To:{Address:string}[]})=>m.To.some(to=>to.Address===email))?.ID??"";return Boolean(messageId);}).toBe(true);
  const message=await(await fetch(`http://127.0.0.1:54324/api/v1/message/${messageId}`)).json();
  const link=String(message.HTML).match(/href="([^"]+)"/)?.[1]?.replaceAll("&amp;","&");expect(link).toBeTruthy();const confirmation=new URL(link!);expect(confirmation.origin).toBe(baseURL);expect(confirmation.pathname).toBe("/auth/confirm");
  await page.goto(link!);await expect(page).toHaveURL(/\/security\/email$/);await page.getByRole("button",{name:"اعتماد الدخول بالبريد",exact:true}).click();await expect(page).toHaveURL(/\/staff\/login\?notice=email-confirmed$/);
  expect((await admin.auth.admin.getUserById(id)).data.user?.email_confirmed_at).toBeTruthy();expect((await admin.from("profiles").select("legacy_staff_login,login_email").eq("id",id).single()).data).toMatchObject({legacy_staff_login:false,login_email:email});
  await page.getByLabel("البريد الإلكتروني",{exact:true}).filter({visible:true}).fill(email);await page.getByLabel("كلمة المرور",{exact:true}).filter({visible:true}).fill(password);await page.getByRole("button",{name:"تسجيل الدخول",exact:true}).click();await expect(page).toHaveURL(/\/admin$/);
  const replay=await page.request.get(confirmation.href,{maxRedirects:0});expect(replay.headers().location).toContain("verification-failed");
 }finally{await admin.from("staff_assignments").delete().eq("user_id",id);await admin.from("audit_logs").delete().eq("actor_id",id);await admin.from("profiles").delete().eq("id",id);await admin.auth.admin.deleteUser(id);}
});
