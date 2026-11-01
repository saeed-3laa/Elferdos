import {createClient} from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
try{
 if(!url||!key)throw new Error('Required production Supabase settings are missing.');
 const parsed=new URL(url);if(parsed.protocol!=='https:'||['localhost','127.0.0.1','::1'].includes(parsed.hostname))throw new Error('Production gate rejects local or non-HTTPS database endpoints.');
 if(!process.env.AUTH_RATE_LIMIT_SECRET||process.env.AUTH_RATE_LIMIT_SECRET.length<32)throw new Error('Production rate-limit secret is not configured.');
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
 const result=await client.rpc('deployment_security_status');if(result.error||result.data?.admin_mfa_required!==true)throw new Error('Administrative MFA must be enforced in the database before production deployment.');
 if(result.data.staff_email_login_required!==true)throw new Error('Verified staff email login must be enforced in the database before production deployment.');
 if(!process.env.APP_ORIGIN||new URL(process.env.APP_ORIGIN).protocol!=='https:')throw new Error('A fixed HTTPS APP_ORIGIN is required for confirmation links.');
 if(!Number.isInteger(result.data.active_staff)||result.data.active_staff<1||result.data.pending_mfa_staff!==0)throw new Error('Every active staff account must have a verified real email and verified TOTP factor before mandatory production access.');
 console.log('Automated production identity gates passed. TLS, backups, storage recovery, Auth-provider limits and environment isolation still require deployment evidence.');
}catch(error){console.error(error.message);process.exitCode=1;}
