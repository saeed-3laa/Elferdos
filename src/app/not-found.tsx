import Link from "next/link";
export default function NotFound() {
  return <main id="main" className="container error-page"><h1>الصفحة غير موجودة</h1><Link className="button" href="/">العودة للمنتجات</Link></main>;
}
