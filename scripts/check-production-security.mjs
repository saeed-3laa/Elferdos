import {createClient} from '@supabase/supabase-js';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export class ProductionReadinessError extends Error {}

export function httpsOrigin(value) {
 try {
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||
   ['localhost','127.0.0.1','[::1]','::1','0.0.0.0'].includes(url.hostname))throw new Error();
  return url.origin;
 }catch{throw new ProductionReadinessError('A fixed, non-local HTTPS origin is required.');}
}

// Read-only RPC. Importing this module neither contacts Supabase nor changes policy.
export async function checkProductionSecurity({env=process.env,fetchImpl=globalThis.fetch}={}) {
 const url=httpsOrigin(env.NEXT_PUBLIC_SUPABASE_URL);
 httpsOrigin(env.APP_ORIGIN);
 if(!env.SUPABASE_SERVICE_ROLE_KEY)throw new ProductionReadinessError('Production Supabase credentials are missing.');
 if(!env.AUTH_RATE_LIMIT_SECRET||env.AUTH_RATE_LIMIT_SECRET.length<32)throw new ProductionReadinessError('Production rate-limit secret is not configured.');
 let result;
 try {
  const client=createClient(url,env.SUPABASE_SERVICE_ROLE_KEY,{
   auth:{persistSession:false,autoRefreshToken:false},
   global:{fetch:(input,init)=>fetchImpl(input,{...init,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)})},
  });
  result=await client.rpc('deployment_security_status');
 }catch{throw new ProductionReadinessError('Could not verify production identity readiness.');}
 if(result.error||!result.data||typeof result.data!=='object')throw new ProductionReadinessError('Could not verify production identity readiness.');
 if(result.data.admin_mfa_required!==true)throw new ProductionReadinessError('Administrative MFA must be enforced before production deployment.');
 if(result.data.staff_email_login_required!==true)throw new ProductionReadinessError('Verified staff email login must be enforced before production deployment.');
 if(!Number.isSafeInteger(result.data.active_staff)||result.data.active_staff<1||result.data.pending_mfa_staff!==0)
  throw new ProductionReadinessError('Every active staff account must have verified email and TOTP before production deployment.');
 return {ready:true};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  await checkProductionSecurity();
  console.log('Production identity readiness passed. Hosting, backups and provider limits require separate verification.');
 }catch(error){
  console.error(error instanceof ProductionReadinessError?error.message:'Could not verify production identity readiness.');
  process.exitCode=1;
 }
}
