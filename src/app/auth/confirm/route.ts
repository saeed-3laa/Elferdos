import {NextRequest,NextResponse} from "next/server";
import {createSessionClient} from "@/server/supabase/session";
import {siteOrigin} from "@/server/auth/site-origin";
export async function GET(request:NextRequest){const origin=siteOrigin();const token=request.nextUrl.searchParams.get("token_hash"),type=request.nextUrl.searchParams.get("type");if(token&&/^[a-zA-Z0-9_-]{20,256}$/.test(token)&&(type==="signup"||type==="email_change")){const client=await createSessionClient(true);const result=await client.auth.verifyOtp({token_hash:token,type});if(!result.error)return NextResponse.redirect(new URL("/security/email",origin));}return NextResponse.redirect(new URL("/staff/login?notice=verification-failed",origin));}
