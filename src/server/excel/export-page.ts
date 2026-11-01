import "server-only";
// Retry a read-only page before committing its rows. Never retry authorization,
// validation or other permanent database errors, and never repeat committed rows.
const temporary=new Set(["","PGRST000","PGRST001","PGRST002","PGRST003","57014","08006"]);
export async function readExportPage<T extends {error:{code?:string}|null}>(read:()=>PromiseLike<T>,signal?:AbortSignal):Promise<T>{
 for(let attempt=0;;attempt++){
  signal?.throwIfAborted();const result=await read();
  if(!result.error||!temporary.has(result.error.code??"")||attempt>=2)return result;
  await new Promise(resolve=>setTimeout(resolve,150*(attempt+1)));
 }
}
