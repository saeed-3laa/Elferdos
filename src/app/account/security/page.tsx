import {requireCustomer} from "@/server/auth/customer";
import {AccountShell} from "@/components/account-shell";
import {OwnCredentialsForm} from "@/components/staff-account-forms";
export default async function Page(){await requireCustomer();return <AccountShell title="كلمة المرور" intro="غيّر كلمة مرور حسابك بأمان."><OwnCredentialsForm/></AccountShell>;}
