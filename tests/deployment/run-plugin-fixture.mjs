// Executed only by the offline test runner with an empty, explicitly populated env.
// Every request is handled in memory. Never falls through to a real fetch.
const sha=process.env.COMMIT_REF;
const scenario=process.env.FIXTURE_SCENARIO;
let phase='pre';
const calls={build:0,publish:0,readiness:0,github:0};
globalThis.fetch=async input=>{
 const url=new URL(typeof input==='string'?input:input.url??String(input));
 if(url.origin==='https://api.github.com'){
  calls.github++;
  if(url.pathname.endsWith('/runs'))return Response.json({total_count:1,workflow_runs:[{
   id:10,run_attempt:1,event:'push',head_sha:sha,head_branch:'main',path:'.github/workflows/checks.yml',
   repository:{full_name:'saeed-3laa/Elferdos'},status:'completed',
   conclusion:scenario==='ci-failed'||scenario==='ci-failed-after-build'&&phase==='post'?'failure':'success',
  }]});
  if(url.pathname.endsWith('/jobs'))return Response.json({total_count:1,jobs:[{name:'verify',head_sha:sha,run_attempt:1,status:'completed',conclusion:'success'}]});
  if(url.pathname.endsWith('/branches/main'))return Response.json({commit:{sha}});
 }
 if(url.origin==='https://production-database.invalid'&&url.pathname==='/rest/v1/rpc/deployment_security_status'){
  calls.readiness++;
  if(scenario==='readiness-network')throw new Error(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if(scenario==='readiness-error')return Response.json({message:process.env.SUPABASE_SERVICE_ROLE_KEY},{status:503});
  return Response.json({
   admin_mfa_required:scenario!=='mfa-off'&&!(scenario==='mfa-off-after-build'&&phase==='post'),
   staff_email_login_required:scenario!=='email-off',active_staff:scenario==='no-staff'?0:1,
   pending_mfa_staff:scenario==='pending-staff'?1:0,
  });
 }
 throw new Error('Unexpected fixture request; real network is disabled.');
};

const {onPreBuild,onPostBuild}=await import('../../netlify/plugins/deployment-gates/index.js');
const utils={build:{failBuild:message=>{throw new Error(message);}}};
try{
 await onPreBuild({utils});
 calls.build++;
 phase='post';
 await onPostBuild({utils});
 calls.publish++;
 console.log(JSON.stringify({ok:true,calls}));
}catch(error){
 console.log(JSON.stringify({ok:false,message:error.message,calls}));
 process.exitCode=1;
}
