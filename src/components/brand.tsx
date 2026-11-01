import Image from "next/image";
import Link from "next/link";
export function Brand({admin=false}:{admin?:boolean}) {
  return <Link className="brand brand-identity" href={admin?"/admin":"/"} aria-label={admin?"مخزن الفردوس — الإدارة":"مخزن الفردوس — الرئيسية"}>
    <Image className="brand-logo" src="/branding/ferdous-logo.png" width={2172} height={724} sizes="(max-width: 600px) 144px, 180px" alt="الفردوس لتجارة الجملة" preload />
    <span className="brand-slogan">جملة تسند شغلك</span>
  </Link>;
}
