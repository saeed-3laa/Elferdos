import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
async function files(root){const result=[];for(const entry of await readdir(root,{withFileTypes:true})){const path=join(root,entry.name);if(entry.isDirectory())result.push(...await files(path));else result.push(path.replaceAll('\\','/'));}return result;}
const result={generated:new Date().toISOString().slice(0,10),method:'Source inventory; guards listed are evidence to review, not proof of complete runtime authorization.',actions:[],routes:[],pages:[],dataModules:[],sql:[]};
for(const file of await files('src')){
 if(!/\.(ts|tsx)$/.test(file))continue;const source=await readFile(file,'utf8');
 const guards=[...new Set(source.match(/\b(?:requireStaff|requireCustomer|requireAccount)\([^)]*\)/g)??[])];
 if(/^['"]use server['"];/.test(source.trimStart()))result.actions.push({file,exports:[...source.matchAll(/export\s+async\s+function\s+(\w+)/g)].map(m=>m[1]),guards});
 if(file.endsWith('/route.ts'))result.routes.push({file,methods:[...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/g)].map(m=>m[1]),guards,authTokenExchange:file.includes('/auth/')});
 if(file.endsWith('/page.tsx'))result.pages.push({file,guards,hasDataOperations:/\.(from|rpc)\(/.test(source)});
 if(file.startsWith('src/server/')&&/\.(from|rpc)\(/.test(source))result.dataModules.push({file,guards,serverOnly:source.includes('import "server-only"')});
}
for(const file of await files('supabase/migrations')){const sql=await readFile(file,'utf8');for(const match of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\(/gi))result.sql.push({file,function:match[1]});}
await writeFile('docs/security-surface-inventory.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(result).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length]))));
