import {redirect} from "next/navigation";
import {currentUserId} from "@/lib/auth/session";
import {isEmployeeAccount} from "@/lib/auth/account-surface";
import StorefrontScrollArrows from "./storefront-scroll-arrows";
import "./storefront-scroll-arrows.css";

export default async function CustomerStoreLayout({children}:{children:React.ReactNode}){
 const user=await currentUserId();
 if(user&&await isEmployeeAccount(user))redirect("/restaurant");
 return <>{children}<StorefrontScrollArrows/></>;
}
