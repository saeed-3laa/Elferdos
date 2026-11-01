import "server-only";
import {createHash} from "node:crypto";
import {createAdminClient} from "@/server/supabase/admin";
// Shared PostgreSQL counters apply across server instances. This complements,
// but does not replace, limits on directly reachable database/Auth endpoints.
export async function allowWorkload(scope:"search"|"export"|"import"|"image",identity:string){
 const limits={search:{max:240,window:60},export:{max:30,window:900},import:{max:12,window:900},image:{max:40,window:900}};
 const budget=limits[scope];
 const result=await createAdminClient().rpc("consume_auth_limit",{p_bucket:createHash("sha256").update(`workload:${scope}:${identity}`).digest("hex"),p_max:budget.max,p_window_seconds:budget.window});
 return !result.error&&result.data===true;
}
