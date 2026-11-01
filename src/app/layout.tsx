import type { Metadata } from "next";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./globals.css";
import "./design-system.css";
import {CartProvider} from "@/components/cart-provider";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "مخزن الفردوس | طلبات الجملة",
  description: "منتجات الجملة لأصحاب المحلات داخل الإسكندرية. كراتين وبالتات كاملة وتوصيل حتى المحل.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl" data-scroll-behavior="smooth"><body>
    <a className="skip-link" href="#main">انتقل إلى المحتوى</a>
    <CartProvider>{children}</CartProvider>
  </body></html>;
}
