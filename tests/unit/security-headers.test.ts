import {describe,it,expect} from "vitest";
import {contentSecurityPolicy} from "@/domain/security-headers";
describe("content security policy",()=>{
 const nonce="YWJjZGVmZ2hpamtsbW5vcA==";
 it("requires the nonce and excludes production eval and inline scripts",()=>{const policy=contentSecurityPolicy({nonce,supabaseUrl:"https://example.supabase.co",https:true});expect(policy).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);expect(policy).not.toContain("unsafe-eval");expect(policy.split(';').find(v=>v.includes('script-src'))).not.toContain('unsafe-inline');expect(policy).toContain("frame-ancestors 'none'");expect(policy).toContain('upgrade-insecure-requests');expect(policy).toContain("connect-src 'self' https://example.supabase.co");});
 it("limits development exceptions to eval and sockets without forcing HTTPS on localhost",()=>{const policy=contentSecurityPolicy({nonce,development:true,supabaseUrl:"http://127.0.0.1:54321"});expect(policy).toContain("'unsafe-eval'");expect(policy).toContain('ws: wss:');expect(policy).not.toContain('upgrade-insecure-requests');});
 it("rejects injectable nonces",()=>{expect(()=>contentSecurityPolicy({nonce:"bad'; script-src *"})).toThrow('INVALID_NONCE');});
});
