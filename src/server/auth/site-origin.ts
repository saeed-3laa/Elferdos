import "server-only";
export function siteOrigin(){
 const configured=process.env.APP_ORIGIN;
 if(configured){const url=new URL(configured);if(url.username||url.password||url.pathname!=="/"||url.search||url.hash)throw new Error("INVALID_APP_ORIGIN");if(url.protocol==="https:"||(url.protocol==="http:"&&["localhost","127.0.0.1"].includes(url.hostname)))return url.origin;throw new Error("HTTPS_REQUIRED");}
 const db=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??"");
 if(["localhost","127.0.0.1"].includes(db.hostname))return "http://127.0.0.1:3000";
 throw new Error("APP_ORIGIN_REQUIRED");
}
