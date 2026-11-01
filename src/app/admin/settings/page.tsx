import { requireStaff } from "@/server/auth/staff";
import {PaymentSettingsForm} from "@/components/payment-settings-form";

export default async function SettingsPage() {
  const { client } = await requireStaff("settings.write");
  const payment=await client.from("payment_settings").select("revision,instapay_recipient").eq("id",true).single();if(payment.error)throw new Error("PAYMENT_SETTINGS_UNAVAILABLE");
  return <><div className="account-title"><h1>إعدادات الدفع</h1><p className="muted">التوصيل مجاني. توافر المنتجات يتحدد من صفحة المنتج.</p></div><div className="reference-grid"><PaymentSettingsForm revision={payment.data.revision} recipient={payment.data.instapay_recipient}/></div></>;
}
