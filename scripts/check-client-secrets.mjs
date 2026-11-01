import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
const values=['SUPABASE_SERVICE_ROLE_KEY','AUTH_RATE_LIMIT_SECRET'].map(name=>process.env[name]).filter(v=>typeof v==='string'&&v.length>=20);
if(values.length!==2)throw new Error('Expected both configured server-only values; scan not executed.');
let files=0,matches=0;
async function visit(folder){for(const entry of await readdir(folder,{withFileTypes:true})){const path=join(folder,entry.name);if(entry.isDirectory())await visit(path);else{files++;const data=await readFile(path);for(const value of values)if(data.includes(Buffer.from(value))||data.includes(Buffer.from(Buffer.from(value).toString('base64')))){matches++;console.error('Server-only value detected in a public build asset.');}}}}
await visit('.next/static');console.log(JSON.stringify({publicBuildFilesScanned:files,serverOnlyValuesChecked:values.length,literalOrBase64Matches:matches}));
if(matches)process.exitCode=1;
