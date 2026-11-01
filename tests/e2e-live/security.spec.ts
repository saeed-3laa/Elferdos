import {createHash,createHmac,randomInt,randomUUID} from "node:crypto";
import ExcelJS from "exceljs";
import {createClient,type SupabaseClient} from "@supabase/supabase-js";
import {test,expect,type Page} from "@playwright/test";
function service(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;if(!["localhost","127.0.0.1"].includes(new URL(url).hostname))throw new Error("Local staging tests only");return createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});}
async function identity(admin:SupabaseClient,owner=false,emailVerified=false){const phone=`+2015${randomInt(10000000,99999999)}`,password=randomUUID()+"Aa1!";const email=`security-${randomUUID()}@example.test`;const result=await admin.auth.admin.createUser({phone,password,phone_confirm:true,...(owner||emailVerified?{email,email_confirm:true}:{}),user_metadata:{full_name:"اختبار أمان محلي",shop_name:owner?"":"محل اختبار أمان"}});expect(result.error).toBeNull();const id=result.data.user!.id;if(owner)expect((await admin.from('staff_assignments').insert({user_id:id,role:'OWNER'})).error).toBeNull();return {id,phone,email,password};}
async function cleanup(admin:SupabaseClient,ids:string[]){for(const id of ids){expect((await admin.from('staff_assignments').delete().eq('user_id',id)).error).toBeNull();expect((await admin.from('audit_logs').delete().eq('actor_id',id)).error).toBeNull();expect((await admin.from('profiles').delete().eq('id',id)).error).toBeNull();expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();}}
async function login(page:Page,user:{phone:string;email:string;password:string},owner=false,destination?:RegExp){await page.goto(owner?'/staff/login':'/login');await page.getByLabel(owner?'البريد الإلكتروني':'رقم الموبايل',{exact:true}).filter({visible:true}).fill(owner?user.email:user.phone);await page.getByLabel('كلمة المرور',{exact:true}).filter({visible:true}).fill(user.password);await page.getByRole('button',{name:'تسجيل الدخول',exact:true}).click();await expect(page).toHaveURL(destination??(owner?/\/admin$/:/\/account$/));}
function totp(secret:string){let value=0,bits=0;const bytes:number[]=[];for(const c of secret.toUpperCase().replace(/=+$/,'')){const index='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c);if(index<0)throw new Error('Invalid test factor');value=(value<<5)|index;bits+=5;if(bits>=8){bits-=8;bytes.push((value>>>bits)&255);value&=(1<<bits)-1;}}const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',Buffer.from(bytes)).update(counter).digest();return String((hash.readUInt32BE(hash[hash.length-1]!&15)&0x7fffffff)%1000000).padStart(6,'0');}

test('production CSP blocks injected scripts, varies nonces, protects responses and aligns the availability checkbox',async({page,request})=>{
 const response=await page.goto('/');expect(response?.status()).toBe(200);const headers=response!.headers();const policy=headers['content-security-policy']!;expect(policy).toContain("'strict-dynamic'");expect(policy).not.toContain('unsafe-eval');expect(headers['x-content-type-options']).toBe('nosniff');expect(headers['x-frame-options']).toBe('DENY');expect(headers['strict-transport-security']).toContain('max-age=');expect(headers['cache-control']).toContain('no-store');
 const nonce=policy.match(/'nonce-([^']+)'/)?.[1];expect(nonce).toBeTruthy();expect(await page.locator('script').evaluateAll(elements=>elements.some(el=>(el as HTMLScriptElement).nonce.length>0))).toBe(true);
 const next=await request.get('/');expect(next.headers()['content-security-policy']).not.toContain(`'nonce-${nonce}'`);
 await page.route('**/?csp-probe=1',async route=>{const original=await route.fetch();const body=(await original.text()).replace('</head>','<script>window.__securityInjected=true</script></head>');await route.fulfill({response:original,body});});await page.goto('/?csp-probe=1');expect(await page.evaluate(()=>('__securityInjected' in window))).toBe(false);
 const denied=await request.get('/api/search?scope=customers&q=1');expect(denied.status()).toBe(403);expect(denied.headers()['cache-control']).toContain('no-store');expect(denied.headers()['vary']).toContain('Cookie');expect(denied.headers()['access-control-allow-origin']).not.toBe('*');
 expect((await request.get('/api/search?scope=invalid&q=1')).status()).toBe(400);
 const exportDenied=await request.get('/admin/excel/export?kind=customers',{maxRedirects:0});expect([303,307]).toContain(exportDenied.status());expect(exportDenied.headers()['location']).toContain('/login');
 for(const kind of ['customers','products']){const denied=await request.get('/admin/reports/export?kind='+kind,{maxRedirects:0});expect([303,307]).toContain(denied.status());expect(denied.headers()['location']).toContain('/login');}
 const checkbox=page.locator('.catalog-filters .checkbox-label input');if(await checkbox.count()){
  const difference=await checkbox.evaluate(input=>{const rect=input.getBoundingClientRect(),label=input.closest('label')!;const text=[...label.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent?.trim());if(!text)throw new Error('Missing checkbox label');const range=document.createRange();range.selectNodeContents(text);const r=range.getBoundingClientRect();return Math.abs(rect.y+rect.height/2-r.y-r.height/2);});expect(difference).toBeLessThan(4);
 }
});

test('direct Server Action replay is denied for customers and hostile origins while the authorized control succeeds',async({page,browser,baseURL})=>{
 test.setTimeout(120000);const admin=service(),ids:string[]=[];const owner=await identity(admin,true),customer=await identity(admin);ids.push(customer.id,owner.id);const other=await browser.newContext();
 const phones=Array.from({length:4},()=>`employee-${randomUUID()}@example.test`);const password=randomUUID()+'Aa1!';
 try{
  await login(page,owner,true);await page.goto('/admin/staff/new');await page.getByLabel('البريد الإلكتروني',{exact:true}).filter({visible:true}).fill(phones[0]!);await page.getByLabel('كلمة المرور',{exact:true}).filter({visible:true}).fill(password);
  const posted=page.waitForRequest(r=>r.method()==='POST'&&Boolean(r.headers()['next-action']));await page.getByRole('button',{name:'إنشاء حساب الموظف',exact:true}).click();const captured=await posted;await expect(page.getByRole('status')).toContainText('تم إنشاء حساب الموظف');
  const raw=captured.postData()!;expect(raw.includes(phones[0]!)).toBe(true);const h=captured.headers();const headers={'next-action':h['next-action']!,'content-type':h['content-type']!,origin:baseURL!};
  const userPage=await other.newPage();await login(userPage,customer);
  const blocked=await other.request.post(captured.url(),{headers,data:raw.replaceAll(phones[0]!,phones[1]!),maxRedirects:0});expect(blocked.headers()['x-action-redirect']??blocked.headers()['location']??await blocked.text()).toContain('/account');expect((await admin.from('profiles').select('id').eq('login_email',phones[1]!).maybeSingle()).data).toBeNull();
  const allowed=await page.request.post(captured.url(),{headers,data:raw.replaceAll(phones[0]!,phones[2]!)});expect(allowed.ok()).toBe(true);const allowedUser=await admin.from('profiles').select('id,account_kind').eq('login_email',phones[2]!).single();expect(allowedUser.error).toBeNull();expect(allowedUser.data?.account_kind).toBe('STAFF');
  const crossOrigin=await page.request.post(captured.url(),{headers:{...headers,origin:'https://untrusted.invalid'},data:raw.replaceAll(phones[0]!,phones[3]!),maxRedirects:0});expect([400,403,500]).toContain(crossOrigin.status());expect((await admin.from('profiles').select('id').eq('login_email',phones[3]!).maybeSingle()).data).toBeNull();
 }finally{for(const phone of phones){const p=await admin.from('profiles').select('id').eq('login_email',phone).maybeSingle();if(p.data)ids.unshift(p.data.id);}await other.close();await cleanup(admin,ids);}
});

test('staff verifies TOTP, blocks password-only credential replay and receives a verified aal2 session',async({page,browser,baseURL})=>{
 test.setTimeout(90000);
 const admin=service(),owner=await identity(admin,true,true);const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  await login(page,owner,true);await page.goto('/security/mfa');await page.getByRole('button',{name:'تجهيز رمز الربط',exact:true}).click();const qr=page.getByRole('img',{name:'رمز ربط تطبيق التحقق الخاص بحسابك',exact:true});await expect(qr).toBeVisible();await expect(qr).toHaveJSProperty('complete',true);expect(await qr.evaluate(image=>(image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect((await client.auth.signInWithPassword({phone:owner.phone,password:owner.password})).error).toBeNull();const enrollment=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Synthetic staging factor'});expect(enrollment.error).toBeNull();if(enrollment.error)throw new Error('Test enrollment failed');
  const verified=await client.auth.mfa.challengeAndVerify({factorId:enrollment.data.id,code:totp(enrollment.data.totp.secret)});expect(verified.error).toBeNull();
  await login(page,owner,true,/\/security\/mfa$/);await page.goto('/admin/profile');await expect(page).toHaveURL(/\/security\/mfa$/);await expect(page.getByRole('heading',{name:'رمز تطبيق التحقق',exact:true})).toBeVisible();await page.getByLabel('رمز التحقق',{exact:true}).filter({visible:true}).fill(totp(enrollment.data.totp.secret));await page.getByRole('button',{name:'تأكيد الرمز والدخول',exact:true}).click();await expect(page).toHaveURL(/\/admin$/);await page.goto('/admin/profile');await expect(page.locator('.mfa-status').filter({visible:true})).toContainText('تم التحقق لهذه الجلسة');
  // Capture a real action envelope without executing the authorized password
  // mutation, then replay it with the same identity at password-only assurance.
  await page.route('**/admin/profile',route=>route.request().method()==='POST'?route.fulfill({status:204}):route.continue());
  const attemptedPassword=randomUUID()+'Aa1!';await page.getByLabel('كلمة المرور الحالية',{exact:true}).filter({visible:true}).fill(owner.password);await page.getByLabel('كلمة مرور جديدة',{exact:true}).filter({visible:true}).fill(attemptedPassword);await page.getByLabel('تأكيد كلمة المرور الجديدة',{exact:true}).filter({visible:true}).fill(attemptedPassword);
  const posted=page.waitForRequest(r=>r.method()==='POST'&&Boolean(r.headers()['next-action']));await page.getByRole('button',{name:'حفظ بيانات الدخول',exact:true}).click();const captured=await posted;
  const low=await browser.newContext();try{const p=await low.newPage();await login(p,owner,true,/\/security\/mfa$/);const h=captured.headers();const denied=await low.request.post(captured.url(),{headers:{'next-action':h['next-action']!,'content-type':h['content-type']!,origin:baseURL!},data:captured.postData()!,maxRedirects:0});expect(denied.headers()['x-action-redirect']??denied.headers()['location']).toContain('/security/mfa');}finally{await low.close();}
  const passwordOnly=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});expect((await passwordOnly.auth.signInWithPassword({email:owner.email,password:owner.password})).error).toBeNull();const deniedFactor=await passwordOnly.auth.mfa.unenroll({factorId:enrollment.data.id});expect(deniedFactor.error?.status).toBe(422);expect(deniedFactor.error?.code).toBe('insufficient_aal');
 }finally{await cleanup(admin,[owner.id]);}
});

test('customer exports exclude staff and the shared export budget blocks excess processing',async({page})=>{
 const admin=service(),owner=await identity(admin,true),customer=await identity(admin);
 try{
  await login(page,owner,true);const exported=await page.request.get('/admin/excel/export?kind=customers');expect(exported.ok()).toBe(true);
  const book=new ExcelJS.Workbook();await book.xlsx.load(await exported.body() as unknown as Parameters<typeof book.xlsx.load>[0]);const values=JSON.stringify(book.worksheets[0]!.getSheetValues());expect(values).toContain(customer.id);expect(values).not.toContain(owner.id);expect(values).not.toContain(owner.phone);
  const bucket=createHash('sha256').update(`workload:export:${owner.id}`).digest('hex');
  const attempts=await Promise.all(Array.from({length:29},()=>admin.rpc('consume_auth_limit',{p_bucket:bucket,p_max:30,p_window_seconds:900})));expect(attempts.every(r=>!r.error&&r.data===true)).toBe(true);
  const blocked=await page.request.get('/admin/excel/export?kind=customers');expect(blocked.status()).toBe(429);expect(blocked.headers()['retry-after']).toBe('900');expect(blocked.headers()['cache-control']).toContain('no-store');
 }finally{await cleanup(admin,[customer.id,owner.id]);}
});
