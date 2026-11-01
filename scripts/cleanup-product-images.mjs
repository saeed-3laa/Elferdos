import {createClient} from "@supabase/supabase-js";
import {parseArgs} from "node:util";

const {values}=parseArgs({options:{apply:{type:"boolean",default:false},"dry-run":{type:"boolean",default:false}}});
if (values.apply && values["dry-run"]) throw new Error("Choose either preview or apply.");

// Optional bounded maintenance: never delete current images or recent uploads.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Server storage configuration is required.");
const admin = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const bucket = admin.storage.from("product-images");
const candidates = [];
const cutoff = Date.now()-24*3600000;
outer: for (let offset=0;;offset+=100) {
  const folders = await bucket.list("",{limit:100,offset,sortBy:{column:"name",order:"asc"}});
  if (folders.error) throw new Error("Storage listing failed; no cleanup performed.");
  for (const folder of folders.data) {
    if (!/^[0-9a-f-]{36}$/.test(folder.name) || folder.id) continue;
    for (let fileOffset=0;;fileOffset+=100) {
      const files = await bucket.list(folder.name,{limit:100,offset:fileOffset,sortBy:{column:"name",order:"asc"}});
      if (files.error) throw new Error("Storage listing failed; no cleanup performed.");
      for (const file of files.data) {
        if (/^[0-9a-f-]{36}\.webp$/.test(file.name) && file.created_at && new Date(file.created_at).getTime()<cutoff) candidates.push(`${folder.name}/${file.name}`);
        if (candidates.length>=500) break outer;
      }
      if (files.data.length<100) break;
    }
  }
  if (folders.data.length<100) break;
}
let removedCount=0;
let unusedCount=0;
for (let offset=0;offset<candidates.length;offset+=100) {
  const paths=candidates.slice(offset,offset+100);
  const referenced=await admin.from("product_images").select("storage_path").in("storage_path",paths);
  if (referenced.error) throw new Error("Reference check failed; cleanup stopped.");
  const used=new Set(referenced.data.map(row=>row.storage_path));
  const unused=paths.filter(path=>!used.has(path));
  unusedCount+=unused.length;
  if (unused.length && values.apply) {
    const removed=await bucket.remove(unused);
    if (removed.error) throw new Error("Storage cleanup failed; retry later.");
    removedCount+=unused.length;
  }
}
console.log(values.apply ? `Product image maintenance: ${removedCount} old unreferenced files removed.` : `Preview only: ${unusedCount} old unreferenced files eligible; no files deleted.`);
