import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {waitForSuccessfulCi,deploymentPolicy,createNetlifyHandlers} from '../../scripts/deployment-gates.mjs';
import {checkProductionSecurity} from '../../scripts/check-production-security.mjs';

const sha='a'.repeat(40);
const secret='dummy-production-secret-never-log';
const staging={NETLIFY:'true',CONTEXT:'production',BRANCH:'main',COMMIT_REF:sha,FERDOUS_DEPLOYMENT_TIER:'staging',
 URL:'https://elferdos-staging.duckdns.org',APP_ORIGIN:'https://elferdos-staging.duckdns.org',
 NEXT_PUBLIC_SUPABASE_URL:'https://xzljxnzwgzmqeyyvgkxs.supabase.co'};
const production={...staging,FERDOUS_DEPLOYMENT_TIER:'production',URL:'https://production.invalid',APP_ORIGIN:'https://production.invalid',
 FERDOUS_PRODUCTION_ORIGIN:'https://production.invalid',NEXT_PUBLIC_SUPABASE_URL:'https://production-database.invalid',
 SUPABASE_SERVICE_ROLE_KEY:secret,AUTH_RATE_LIMIT_SECRET:'x'.repeat(32)};

function lifecycle(env,scenario='ready'){
 const child=spawnSync(process.execPath,['tests/deployment/run-plugin-fixture.mjs'],{
  cwd:process.cwd(),env:{...env,FIXTURE_SCENARIO:scenario},encoding:'utf8',timeout:10000,maxBuffer:128000,windowsHide:true,
 });
 assert.ifError(child.error);
 assert.ok(!child.stdout.includes(secret)&&!child.stderr.includes(secret),'secret must not enter logs');
 return {status:child.status,...JSON.parse(child.stdout.trim())};
}

test('1: passing CI permits the actual staging plugin lifecycle without production credentials/MFA',()=>{
 const result=lifecycle(staging);
 assert.equal(result.status,0);
 assert.deepEqual(result.calls,{build:1,publish:1,readiness:0,github:6});
});
test('2: failed CI prevents both application build and publication',()=>{
 const result=lifecycle(staging,'ci-failed');
 assert.equal(result.status,1);assert.equal(result.calls.build,0);assert.equal(result.calls.publish,0);
});
test('CI failure after the app build prevents publication at the second boundary',()=>{
 const result=lifecycle(staging,'ci-failed-after-build');
 assert.equal(result.calls.build,1);assert.equal(result.calls.publish,0);assert.equal(result.status,1);
});
test('3: passing production readiness permits the actual production plugin lifecycle',()=>{
 const result=lifecycle(production);
 assert.equal(result.status,0);assert.equal(result.calls.publish,1);assert.equal(result.calls.readiness,2);
});
for(const scenario of ['mfa-off','email-off','no-staff','pending-staff','readiness-error','readiness-network']){
 test(`4: production ${scenario} prevents build and publication without logging credentials`,()=>{
  const result=lifecycle(production,scenario);
  assert.equal(result.status,1);assert.equal(result.calls.build,0);assert.equal(result.calls.publish,0);
 });
}
test('readiness is checked again after build and failure prevents production publication',()=>{
 const result=lifecycle(production,'mfa-off-after-build');
 assert.equal(result.calls.build,1);assert.equal(result.calls.readiness,2);assert.equal(result.calls.publish,0);
});
test('5: staging deliberately never calls the production readiness RPC',async()=>{
 let readiness=0;
 const hooks=createNetlifyHandlers({env:staging,checkCi:async()=>{},checkReadiness:async()=>{readiness++;throw new Error();}});
 const args={utils:{build:{failBuild:assert.fail}}};
 await hooks.onPreBuild(args);await hooks.onPostBuild(args);assert.equal(readiness,0);
});
for(const context of ['deploy-preview','branch-deploy','preview-server','dev']){
 test(`6/7: ${context} is blocked before any build or production RPC even with dummy production secrets injected`,()=>{
  const result=lifecycle({...production,CONTEXT:context});
  assert.equal(result.status,1);assert.deepEqual(result.calls,{build:0,publish:0,readiness:0,github:0});
 });
}
for(const overrides of [{FERDOUS_DEPLOYMENT_TIER:''},{BRANCH:'feature'},{COMMIT_REF:''},{NETLIFY:'false'},
 {FERDOUS_DEPLOYMENT_TIER:'staging'}, {NEXT_PUBLIC_SUPABASE_URL:staging.NEXT_PUBLIC_SUPABASE_URL}]){
 test(`7: untrusted/misclassified deployment fails closed: ${JSON.stringify(overrides)}`,()=>{
  const result=lifecycle({...production,...overrides});assert.equal(result.calls.publish,0);assert.equal(result.status,1);
 });
}
test('the post-build boundary still blocks publication when invoked without a pre-build call',async()=>{
 const hooks=createNetlifyHandlers({env:staging,checkCi:async()=>{throw new Error('private-marker');}});
 let failed=false;
 await assert.rejects(hooks.onPostBuild({utils:{build:{failBuild:message=>{failed=true;assert.ok(!message.includes('private-marker'));}}}}));
 assert.equal(failed,true);
});

const run={id:10,run_attempt:1,event:'push',head_sha:sha,head_branch:'main',path:'.github/workflows/checks.yml',
 repository:{full_name:'saeed-3laa/Elferdos'},status:'completed',conclusion:'success'};
function ciFetch({runs=[run],job={},branch=sha,broken=false}={}){
 return async url=>{
  if(broken)throw new Error(secret);
  if(url.includes('/jobs?'))return Response.json({total_count:1,jobs:[{name:'verify',head_sha:sha,run_attempt:1,status:'completed',conclusion:'success',...job}]});
  if(url.endsWith('/branches/main'))return Response.json({commit:{sha:branch}});
  return Response.json({total_count:runs.length,workflow_runs:runs});
 };
}
test('successful CI must belong to the exact SHA, workflow, branch, event and source repository',async()=>{
 for(const changed of [{head_sha:'b'.repeat(40)},{path:'.github/workflows/other.yml'},{head_branch:'feature'},
  {event:'pull_request'},{repository:{full_name:'attacker/fork'}}]){
  await assert.rejects(waitForSuccessfulCi({sha,fetchImpl:ciFetch({runs:[{...run,...changed}]}),timeoutMs:0}));
 }
});
test('latest failed run cannot be hidden by an older success',async()=>{
 await assert.rejects(waitForSuccessfulCi({sha,fetchImpl:ciFetch({runs:[run,{...run,id:11,conclusion:'failure'}]}),timeoutMs:0}));
});
test('missing, cancelled, skipped, pending and timed-out CI cannot permit publication',async()=>{
 for(const runs of [[],[{...run,conclusion:'cancelled'}],[{...run,conclusion:'skipped'}],[{...run,status:'in_progress',conclusion:null}],
  [{...run,conclusion:'timed_out'}]]){
  await assert.rejects(waitForSuccessfulCi({sha,fetchImpl:ciFetch({runs}),timeoutMs:0}));
 }
});
test('failed/skipped/mismatched required verify job, rerun attempt and stale main all block deployment',async()=>{
 for(const job of [{conclusion:'failure'},{conclusion:'skipped'},{run_attempt:2},{head_sha:'b'.repeat(40)},{name:'unrelated'}]){
  await assert.rejects(waitForSuccessfulCi({sha,fetchImpl:ciFetch({job}),timeoutMs:0}));
 }
 await assert.rejects(waitForSuccessfulCi({sha,fetchImpl:ciFetch({branch:'b'.repeat(40)}),timeoutMs:0}));
});
test('queued CI waits for success using bounded in-memory time; no Netlify status dependency',async()=>{
 let time=0,calls=0;
 const ready=ciFetch();
 const fetchImpl=async url=>{
  if(url.includes('/runs?')&&calls++===0)return Response.json({total_count:1,workflow_runs:[{...run,status:'queued',conclusion:null}]});
  return ready(url);
 };
 assert.equal((await waitForSuccessfulCi({sha,fetchImpl,now:()=>time,sleep:async ms=>{time+=ms;},pollMs:10,timeoutMs:30})).runId,10);
 assert.equal(time,10);
});
test('GitHub errors, rate limits and malformed responses fail closed with sanitized messages',async()=>{
 for(const fetchImpl of [ciFetch({broken:true}),async()=>Response.json({message:secret},{status:403}),async()=>Response.json({}),
  async()=>new Response('not-json'),async()=>Response.json({total_count:101,workflow_runs:[]})]){
  await assert.rejects(waitForSuccessfulCi({sha,fetchImpl,timeoutMs:0}),error=>!error.message.includes(secret));
 }
});
test('production checker accepts only explicit verified policy data; malformed responses fail closed',async()=>{
 for(const data of [null,{}, {admin_mfa_required:'true',staff_email_login_required:true,active_staff:1,pending_mfa_staff:0},
  {admin_mfa_required:true,staff_email_login_required:true,active_staff:1},
  {admin_mfa_required:true,staff_email_login_required:true,active_staff:1,pending_mfa_staff:'0'}]){
  await assert.rejects(checkProductionSecurity({env:production,fetchImpl:async()=>Response.json(data)}));
 }
});
test('unsafe production origin, missing credentials and missing rate secret fail before any RPC',async()=>{
 for(const overrides of [{APP_ORIGIN:'https://host.invalid/path'},{APP_ORIGIN:'https://user:password@host.invalid'},
  {NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321'},{SUPABASE_SERVICE_ROLE_KEY:''},{AUTH_RATE_LIMIT_SECRET:''}]){
  let calls=0;
  await assert.rejects(checkProductionSecurity({env:{...production,...overrides},fetchImpl:async()=>{calls++;throw new Error();}}));
  assert.equal(calls,0);
 }
});
test('actual plugin exports both enforcing hooks and Netlify always installs it outside the build command',async()=>{
 const config=await readFile('netlify.toml','utf8');
 assert.match(config,/\[\[plugins\]\]\s+package = "\.\/netlify\/plugins\/deployment-gates"/);
 assert.ok(config.indexOf('package = "@netlify/plugin-nextjs"')<config.indexOf('package = "./netlify/plugins/deployment-gates"'));
 const hooks=await import('../../netlify/plugins/deployment-gates/index.js');
 assert.equal(typeof hooks.onPreBuild,'function');assert.equal(typeof hooks.onPostBuild,'function');
 assert.deepEqual(Object.keys(hooks).sort(),['onPostBuild','onPreBuild']);
 const pkg=JSON.parse(await readFile('package.json','utf8'));
 assert.equal(pkg.scripts.build,'next build','CI build must not wait for its own CI gate');
 const ci=await readFile('.github/workflows/checks.yml','utf8');
 assert.ok(ci.includes('npm run test:deployment-gates'));
 assert.ok(!ci.includes('netlify deploy')&&!ci.includes('check-production-security.mjs'));
});
test('preview configuration blanks every known privileged credential and backend setting',async()=>{
 const config=await readFile('netlify.toml','utf8');
 const preview=config.split('[context.deploy-preview.environment]')[1].split('\n[')[0];
 for(const key of ['SUPABASE_SERVICE_ROLE_KEY','AUTH_RATE_LIMIT_SECRET','FERDOUS_GITHUB_READ_TOKEN',
  'NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','APP_ORIGIN']){
  assert.ok(preview.includes(`${key} = ""`));
 }
});
test('the real checker CLI fails closed with a scrubbed environment and does not print raw secrets',()=>{
 const child=spawnSync(process.execPath,['scripts/check-production-security.mjs'],{
  env:{SUPABASE_SERVICE_ROLE_KEY:secret},encoding:'utf8',timeout:10000,maxBuffer:128000,windowsHide:true,
 });
 assert.ifError(child.error);assert.equal(child.status,1);assert.ok(!child.stderr.includes(secret));
});
test('staging cannot silently use a production database or a different application origin',()=>{
 assert.throws(()=>deploymentPolicy({...staging,NEXT_PUBLIC_SUPABASE_URL:production.NEXT_PUBLIC_SUPABASE_URL}));
 assert.throws(()=>deploymentPolicy({...staging,APP_ORIGIN:production.APP_ORIGIN}));
});
