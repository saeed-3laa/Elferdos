import {StoreHeader} from "@/components/store-header";
import {MobileStoreNavigation} from "@/components/store-navigation";
export function AccountShell({ title, intro, children }: { title?: string; intro?: string; children: React.ReactNode }) {
  return <div className="storefront account-shell">
    <StoreHeader/>
    <main id="main" className="container account-page">{title && <div className="account-title"><h1>{title}</h1>{intro && <p className="muted">{intro}</p>}</div>}{children}</main>
    <MobileStoreNavigation/>
  </div>;
}
