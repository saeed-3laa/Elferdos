import {spawnSync} from "node:child_process";
import {randomUUID} from "node:crypto";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
if(!url||!["localhost","127.0.0.1"].includes(new URL(url).hostname))throw new Error("Local development restore rehearsal only.");
const marker=randomUUID().replaceAll("-","");
const database=`ferdous_restore_${marker}`,dump=`/tmp/ferdous-restore-${marker}.dump`;
const container="supabase_db_al-ferdous-wholesale";let created=false,dumped=false;
function run(args){const result=spawnSync("docker",["exec",container,...args],{encoding:"utf8",timeout:180000,windowsHide:true});if(result.status!==0){const line=String(result.stderr||result.error?.message||"").split(/\r?\n/).find(line=>line.toLowerCase().includes("error"))??"command failed";throw new Error(`Database rehearsal failed at ${args[0]}: ${line.slice(0,300)}`);}return result.stdout;}
try{
 run(["test","!","-e",dump]);run(["pg_dump","-U","postgres","-d","postgres","-Fc","-f",dump]);dumped=true;
 run(["createdb","-U","postgres",database]);created=true;
 // The bundled managed schemas contain superuser-only function settings. Restore
 // with the container's verified maintenance role, retaining original ownership.
 run(["pg_restore","-U","supabase_admin","--exit-on-error","-d",database,dump]);
 const metrics=run(["psql","-U","postgres","-d",database,"-qAt","-v","ON_ERROR_STOP=1","-c","select json_build_object('profiles', (select count(*) from public.profiles),'products',(select count(*) from public.products),'orders',(select count(*) from public.orders),'foreign_keys',(select count(*) from pg_constraint where contype='f' and connamespace='public'::regnamespace),'status','restored');"]);
 console.log(metrics.trim());console.log("Database backup restored successfully to a newly created isolated database. Storage files require a separate backup.");
}catch(error){console.error(error.message);process.exitCode=1;}
finally{
 // Never drop postgres or a supplied/computed existing database. This exact UUID
 // target was generated and successfully created above during THIS invocation.
 try{
 if(created){if(/^ferdous_restore_[0-9a-f]{32}$/.test(database))run(["dropdb","-U","postgres",database]);else{console.error("Invalid isolated database target; retained for review.");process.exitCode=1;}}
 if(dumped){if(/^\/tmp\/ferdous-restore-[0-9a-f]{32}\.dump$/.test(dump))run(["rm","--",dump]);else{console.error("Invalid temporary dump target; retained for review.");process.exitCode=1;}}
 }catch(error){console.error(error.message);process.exitCode=1;}
}
