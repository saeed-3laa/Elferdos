import {createClient} from '@supabase/supabase-js';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';

const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw new Error('Local Storage restore rehearsal only.');
const client=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const target=`restore-test-${randomUUID()}`,folder=resolve('.work','storage-rehearsals',target),uploaded=[];
const hash=data=>createHash('sha256').update(data).digest('hex');let created=false;
try{
 const rows=await client.from('product_images').select('storage_path').limit(201);
 if(rows.error||rows.data.length>200)throw new Error('Cannot read a bounded referenced-image manifest; no original files changed.');
 const manifest=[];await mkdir(folder,{recursive:true});
 for(const row of rows.data){
  const path=row.storage_path;if(!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(path))throw new Error('Unexpected object path; stopped safely.');
  const source=await client.storage.from('product-images').download(path);if(source.error)throw new Error('Original image download failed.');
  const data=Buffer.from(await source.data.arrayBuffer());if(data.length>5*1024*1024)throw new Error('Image exceeds the rehearsal bound.');
  const disk=resolve(folder,path);if(!disk.startsWith(folder+'\\')&&!disk.startsWith(folder+'/'))throw new Error('Invalid backup destination.');
  await mkdir(dirname(disk),{recursive:true});await writeFile(disk,data,{flag:'wx'});manifest.push({path,bytes:data.length,sha256:hash(data)});
 }
 await writeFile(resolve(folder,'manifest.json'),JSON.stringify({bucket:'product-images',scope:'all currently referenced product images',created:new Date().toISOString(),objects:manifest},null,2),{flag:'wx'});
 if(!manifest.length){console.log('No referenced images exist. Empty manifest saved; file restoration was NOT tested.');process.exitCode=2;}
 else{
  const bucket=await client.storage.createBucket(target,{public:false,fileSizeLimit:5*1024*1024,allowedMimeTypes:['image/webp']});if(bucket.error)throw new Error('Could not create the isolated private restore bucket.');created=true;
  for(const entry of manifest){
   const data=await readFile(resolve(folder,entry.path));if(hash(data)!==entry.sha256)throw new Error('Backup checksum mismatch.');
   const stored=await client.storage.from(target).upload(entry.path,data,{contentType:'image/webp',upsert:false});if(stored.error)throw new Error('Isolated image restoration failed.');uploaded.push(entry.path);
   const restored=await client.storage.from(target).download(entry.path);if(restored.error||hash(Buffer.from(await restored.data.arrayBuffer()))!==entry.sha256)throw new Error('Restored image checksum mismatch.');
  }
  console.log(JSON.stringify({status:'restored and checksums verified',images:manifest.length,backupFolder:folder,originalObjectsChanged:false}));
 }
}catch(error){console.error(error.message);process.exitCode=1;}
finally{
 if(created&&/^restore-test-[0-9a-f-]{36}$/.test(target)){
  if(uploaded.length){const removed=await client.storage.from(target).remove(uploaded);if(removed.error){console.error('Isolated rehearsal objects retained; cleanup failed.');process.exitCode=1;}}
  const removed=await client.storage.deleteBucket(target);if(removed.error){console.error('Isolated rehearsal bucket retained; cleanup failed.');process.exitCode=1;}
 }
}
