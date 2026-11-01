import {afterEach,describe,expect,it,vi} from "vitest";
import {siteOrigin} from "../../src/server/auth/site-origin";
afterEach(()=>vi.unstubAllEnvs());
describe("trusted confirmation origin",()=>{
 it("requires an explicit hosted origin",()=>{vi.stubEnv("APP_ORIGIN","");vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://database.example.test");expect(()=>siteOrigin()).toThrow("APP_ORIGIN_REQUIRED");});
 it("uses only a configured HTTPS origin",()=>{vi.stubEnv("APP_ORIGIN","https://shop.example.test");expect(siteOrigin()).toBe("https://shop.example.test");});
 it.each(["https://user:pass@shop.example.test","https://shop.example.test/redirect","https://shop.example.test?next=bad","http://shop.example.test"])("rejects unsafe origin %s",value=>{vi.stubEnv("APP_ORIGIN",value);expect(()=>siteOrigin()).toThrow();});
 it("permits a local default only for a local backend",()=>{vi.stubEnv("APP_ORIGIN","");vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","http://127.0.0.1:54321");expect(siteOrigin()).toBe("http://127.0.0.1:3000");});
});
