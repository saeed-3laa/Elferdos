import {setTimeout as delay} from 'node:timers/promises';
import {checkProductionSecurity,httpsOrigin,ProductionReadinessError} from './check-production-security.mjs';

const repository='saeed-3laa/Elferdos';
const workflow='.github/workflows/checks.yml';
const stagingOrigins=new Set(['https://elferdos-staging.duckdns.org','https://elferdos-staging.netlify.app']);
const stagingDatabase='https://xzljxnzwgzmqeyyvgkxs.supabase.co';
export class DeploymentGateError extends Error {}

export function deploymentPolicy(env){
 // Netlify's "production" context also hosts the existing STAGING site's main branch.
 // Never infer the business environment from CONTEXT alone.
 if(env.NETLIFY!=='true'||env.CONTEXT!=='production'||env.BRANCH!=='main')
  throw new DeploymentGateError('Only the main-branch site deployment is enabled; previews and branch deploys are blocked.');
 if(!/^[a-f0-9]{40}$/.test(env.COMMIT_REF??''))throw new DeploymentGateError('An exact Git commit is required.');
 const tier=env.FERDOUS_DEPLOYMENT_TIER;
 if(tier!=='staging'&&tier!=='production')throw new DeploymentGateError('Set the site-specific FERDOUS_DEPLOYMENT_TIER explicitly.');
 const origin=httpsOrigin(env.URL);
 if(tier==='staging'){
  if(!stagingOrigins.has(origin)||httpsOrigin(env.APP_ORIGIN)!==origin||httpsOrigin(env.NEXT_PUBLIC_SUPABASE_URL)!==stagingDatabase)
   throw new DeploymentGateError('Staging must use the known isolated staging site and database.');
 }else{
  if(stagingOrigins.has(origin)||origin!==httpsOrigin(env.FERDOUS_PRODUCTION_ORIGIN)||
   origin!==httpsOrigin(env.APP_ORIGIN)||httpsOrigin(env.NEXT_PUBLIC_SUPABASE_URL)===stagingDatabase)
   throw new DeploymentGateError('Production must use its explicit origin and a separate production database.');
 }
 return {tier,sha:env.COMMIT_REF};
}

async function githubJson(path,{env,fetchImpl}){
 try{
  const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  if(env.FERDOUS_GITHUB_READ_TOKEN)headers.Authorization=`Bearer ${env.FERDOUS_GITHUB_READ_TOKEN}`;
  const response=await fetchImpl(`https://api.github.com/repos/${repository}/${path}`,{
   headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000),
  });
  if(!response.ok)throw new Error();
  return await response.json();
 }catch{throw new DeploymentGateError('GitHub CI could not be verified; deployment is blocked.');}
}

export async function waitForSuccessfulCi({sha,env=process.env,fetchImpl=globalThis.fetch,
 sleep=delay,now=Date.now,timeoutMs=25*60*1000,pollMs=45000}={}){
 if(!/^[a-f0-9]{40}$/.test(sha??''))throw new DeploymentGateError('An exact Git commit is required.');
 const start=now();
 for(;;){
  const data=await githubJson(`actions/workflows/checks.yml/runs?event=push&head_sha=${sha}&per_page=100`,{env,fetchImpl});
  if(!Array.isArray(data.workflow_runs)||!Number.isInteger(data.total_count)||data.total_count>100)
   throw new DeploymentGateError('The CI response is incomplete; deployment is blocked.');
  const runs=data.workflow_runs.filter(run=>run.head_sha===sha&&run.event==='push'&&run.head_branch==='main'&&
   run.path===workflow&&run.repository?.full_name===repository);
  if(runs.some(run=>!Number.isSafeInteger(run.id)||run.id<1||!Number.isSafeInteger(run.run_attempt)||run.run_attempt<1)||
   new Set(runs.map(run=>run.id)).size!==runs.length)
   throw new DeploymentGateError('The CI run identity is invalid.');
  const latest=runs.sort((a,b)=>b.id-a.id)[0];
  if(latest?.status==='completed'){
   if(latest.conclusion!=='success')throw new DeploymentGateError('The latest CI run did not succeed; deployment is blocked.');
   const jobs=await githubJson(`actions/runs/${latest.id}/jobs?filter=latest&per_page=100`,{env,fetchImpl});
   if(!Array.isArray(jobs.jobs)||!Number.isInteger(jobs.total_count)||jobs.total_count>100)
    throw new DeploymentGateError('The required CI job could not be verified.');
   const required=jobs.jobs.filter(job=>job.name==='verify');
   if(required.length!==1||required[0].head_sha!==sha||required[0].run_attempt!==latest.run_attempt||
    required[0].status!=='completed'||required[0].conclusion!=='success')
    throw new DeploymentGateError('The verify job must pass for this exact commit and run attempt.');
   // Old builds must not publish after main moves to a newer commit.
   const branch=await githubJson('branches/main',{env,fetchImpl});
   if(branch.commit?.sha!==sha)throw new DeploymentGateError('This commit is no longer main; deployment is blocked.');
   return {runId:latest.id,attempt:latest.run_attempt};
  }
  if(now()-start>=timeoutMs)throw new DeploymentGateError('Timed out waiting for successful CI; deployment is blocked.');
  await sleep(Math.min(pollMs,Math.max(0,timeoutMs-(now()-start))));
 }
}

// Used at both Netlify boundaries: before the app build and again before publication.
export function createNetlifyHandlers({env=process.env,checkCi=waitForSuccessfulCi,checkReadiness=checkProductionSecurity}={}){
 async function enforce(phase,{utils}){
  try{
   const policy=deploymentPolicy(env);
   await checkCi({sha:policy.sha,env,timeoutMs:phase==='before-build'?25*60*1000:0});
   if(policy.tier==='production')await checkReadiness({env});
  }catch(error){
   const message=error instanceof DeploymentGateError||error instanceof ProductionReadinessError
    ?error.message:'Deployment verification failed; publication is blocked.';
   utils.build.failBuild(message);
   // Defensive fallback for a host/test adapter whose failBuild does not throw.
   throw new DeploymentGateError(message);
  }
 }
 return {onPreBuild:args=>enforce('before-build',args),onPostBuild:args=>enforce('before-publication',args)};
}
