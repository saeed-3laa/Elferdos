import {AccountShell} from "@/components/account-shell";
import {Checkout} from "@/components/checkout";
import {requireCustomer} from "@/server/auth/customer";
import {createSessionClient} from "@/server/supabase/session";
import {getSupabaseConfig} from "@/server/config";
export default async function CartPage(){
 if(!getSupabaseConfig())return <AccountShell title="السلة"><Checkout addresses={[]} signedIn={false}/></AccountShell>;
 const session=await createSessionClient();
 if(!(await session.auth.getUser()).data.user)return <AccountShell title="السلة"><Checkout addresses={[]} signedIn={false}/></AccountShell>;
 const {client,user,profile}=await requireCustomer();
 const [addresses,payment,zones]=await Promise.all([
  client.from("customer_addresses").select("id,address,is_default,delivery_zones!inner(name,active)").eq("customer_id",user.id).eq("delivery_zones.active",true).order("is_default",{ascending:false}).order("created_at").order("id").limit(25),
  client.from("payment_settings").select("instapay_recipient").eq("id",true).single(),
  client.from("delivery_zones").select("id,name").eq("active",true).order("name").limit(500),
 ]);
 if(addresses.error||payment.error||zones.error)throw new Error("CHECKOUT_UNAVAILABLE");
 return <AccountShell title="السلة وإرسال الطلب"><Checkout
  addresses={addresses.data as unknown as Parameters<typeof Checkout>[0]["addresses"]}
  recipient={payment.data.instapay_recipient} shopAddress={{address:profile.delivery_address,area:profile.area}}
  zones={zones.data}/></AccountShell>;
}
