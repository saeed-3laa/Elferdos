"use client";
import {createContext,useContext,useEffect,useState} from "react";
import {cartSchema,type CartItem} from "@/domain/orders";
import {CartDrawer} from "@/components/cart-drawer";
const Context=createContext<{items:CartItem[];ready:boolean;setItems:(items:CartItem[])=>void;openCart:()=>void}|null>(null);
export function CartProvider({children}:{children:React.ReactNode}) {
 const [items,update]=useState<CartItem[]>([]); const [ready,setReady]=useState(false);
 const [drawerOpen,setDrawerOpen]=useState(false);
 useEffect(()=>{try { const parsed=cartSchema.safeParse(JSON.parse(localStorage.getItem("ferdous-cart-v1")??"[]")); if(parsed.success) update(parsed.data); } catch { /* Browser storage may be unavailable. */ } setReady(true);},[]);
 function setItems(next:CartItem[]) {const parsed=cartSchema.safeParse(next);if(!parsed.success)return;update(parsed.data);try{localStorage.setItem("ferdous-cart-v1",JSON.stringify(parsed.data));}catch{ /* Browser storage may be unavailable. */ }}
 return <Context value={{items,ready,setItems,openCart:()=>setDrawerOpen(true)}}>{children}<CartDrawer open={drawerOpen} onClose={()=>setDrawerOpen(false)}/></Context>;
}
export function useCart(){const cart=useContext(Context);if(!cart)throw new Error("CART_CONTEXT");return cart;}
