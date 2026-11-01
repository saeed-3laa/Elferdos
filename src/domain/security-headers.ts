export function contentSecurityPolicy({nonce,supabaseUrl,development=false,https=false}:{nonce:string;supabaseUrl?:string;development?:boolean;https?:boolean}){
 if(!/^[A-Za-z0-9+/=]{16,128}$/.test(nonce))throw new Error("INVALID_NONCE");
 const origin=supabaseUrl?new URL(supabaseUrl).origin:"";
 return ["default-src 'self'",`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development?" 'unsafe-eval'":""}`,"style-src 'self' 'unsafe-inline'",`img-src 'self' data: blob:${origin?` ${origin}`:""}`,"font-src 'self'",`connect-src 'self'${origin?` ${origin}`:""}${development?" ws: wss:":""}`,"object-src 'none'","base-uri 'none'","frame-ancestors 'none'","form-action 'self'",...(https?["upgrade-insecure-requests"]:[])].join('; ');
}
