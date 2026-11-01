import {createSessionClient} from "@/server/supabase/session";
import {getSupabaseConfig} from "@/server/config";
const headers={"Cache-Control":"private, no-store","Vary":"Cookie"};
export async function GET(){
 if(!getSupabaseConfig())return Response.json({signedIn:false,unread:0},{headers});
 const client=await createSessionClient(true);
 // PostgREST verifies the JWT; the RPC checks the active profile and session.
 // Avoid a separate Auth-network round trip on every notification poll.
 const result=await client.rpc("notification_summary");
 if(result.error)return Response.json({signedIn:false,unread:0},{headers,status:result.error.code==="42501"||result.error.message.includes("FORBIDDEN")?200:503});
 return Response.json({signedIn:true,unread:result.data.unread},{headers});
}
