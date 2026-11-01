import {NextRequest,NextResponse} from "next/server";
import {createSessionClient} from "@/server/supabase/session";
import {siteOrigin} from "@/server/auth/site-origin";
export async function GET(request:NextRequest){const origin=siteOrigin();const code=request.nextUrl.searchParams.get("code");if(code&&code.length<4096){const client=await createSessionClient(true);const result=await client.auth.exchangeCodeForSession(code);if(!result.error)return NextResponse.redirect(new URL("/security/email",origin));}return NextResponse.redirect(new URL("/staff/login?notice=verification-failed",origin));}
