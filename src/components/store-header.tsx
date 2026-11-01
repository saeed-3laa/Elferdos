import Link from "next/link";
import {Brand} from "@/components/brand";
import {CartLink} from "@/components/store-navigation";
import {Icon} from "@/components/icon";
import {NotificationBell} from "@/components/notification-bell";
export function StoreHeader({home=false}:{home?:boolean}){
 return <><div className="service-strip"><div className="container"><span><Icon name="location"/>معاك، لحد باب محلك في الإسكندرية</span><span>كراتين وبالتات كاملة · كاش أو إنستا باي</span></div></div>
 <header className="site-header store-header"><div className="container header-inner"><Brand/>
 <nav aria-label={home?"التنقل الرئيسي":"حساب العميل"}><Link href={home?"#products":"/#products"}>المنتجات</Link><Link href="/account/orders">طلباتي</Link>{home?<a href="#delivery">التوصيل والدفع</a>:<Link href="/account/addresses">العناوين</Link>}</nav>
 <div className="header-actions"><NotificationBell/><Link className="account-link" href="/account"><Icon name="user"/><span>حسابي</span></Link><CartLink/></div></div></header></>;
}
