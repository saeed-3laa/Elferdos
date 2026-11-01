import "server-only";
import {redirect} from "next/navigation";
import type {SupabaseClient} from "@supabase/supabase-js";
// Enrollment/challenge remain reachable at aal1. Credential changes do not.
export async function requireCredentialAssurance(client:SupabaseClient,kind:string){
 if(kind!=="STAFF")return;
 const result=await client.rpc("get_staff_access");
 if(result.error||!result.data)redirect("/staff/login");
 if(result.data.mfa_required&&!result.data.mfa_verified)redirect("/security/mfa");
}
