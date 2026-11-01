import { AccountShell } from "@/components/account-shell";
import { AddressForm, DeleteAddressForm, type ZoneOption, type SavedAddress } from "@/components/account-forms";
import { StatusPanel } from "@/components/status-panel";
import { requireCustomer } from "@/server/auth/customer";
import { getSupabaseConfig } from "@/server/config";
import { redirect } from "next/navigation";

export default async function AddressesPage() {
  if (!getSupabaseConfig()) redirect("/login");
  const { client, profile } = await requireCustomer();
  const [addressesResult, zonesResult] = await Promise.all([
    client.from("customer_addresses").select("id,zone_id,address,notes,is_default").order("created_at").order("id").limit(25),
    client.from("delivery_zones").select("id,name").eq("active", true).order("name").limit(500),
  ]);
  if (addressesResult.error || zonesResult.error) throw new Error("ADDRESSES_UNAVAILABLE");
  const addresses = addressesResult.data as SavedAddress[];
  const zones = zonesResult.data as ZoneOption[];
  return <AccountShell title="عناوين التوصيل" intro="اختر منطقة متاحة واحفظ عنوانك. التوصيل مجاني لكل المناطق المتاحة.">
    <div className="address-list">{addresses.length === 0 && <StatusPanel title="عنوان المحل المسجل"><p>{profile.area} — {profile.delivery_address}</p><p>اختر منطقة التوصيل لحفظه؛ العنوان مكتوب مسبقًا في النموذج.</p></StatusPanel>}
      {addresses.map((address) => <section className="form-panel" key={address.id}>
        <h2>{address.is_default ? "العنوان الافتراضي" : "عنوان محفوظ"}</h2>
        {zones.some((zone) => zone.id === address.zone_id) ? <AddressForm zones={zones} address={address} /> : <><p>{address.address}</p><p className="form-error">منطقة هذا العنوان غير متاحة حاليًا. أضف عنوانًا ضمن منطقة متاحة.</p></>}
        <DeleteAddressForm id={address.id} />
      </section>)}
    </div>
    <section className="form-panel new-address"><h2>إضافة عنوان</h2>{zones.length ? <AddressForm zones={zones} initialAddress={!addresses.length?{address:profile.delivery_address,notes:profile.delivery_notes}:undefined} /> : <StatusPanel title="مناطق التوصيل قيد الإعداد"><p>الإدارة لم تضف مناطق التوصيل بعد. بيانات عنوانك الأساسي محفوظة في حسابك.</p></StatusPanel>}</section>
  </AccountShell>;
}
