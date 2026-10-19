import {redirect} from "next/navigation";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import InternationalShippingReviews from "./international-shipping-reviews";
export const dynamic="force-dynamic";
export default async function InternationalShippingPage(){
 const user=await currentActiveAdminUserId();
 if(!user)redirect("/login");
 try{await requirePlatformRole(user,["super_admin","admin"])}catch{redirect("/admin")}
 return <main className="workspace" dir="rtl"><header className="workspace-head"><div><h1>موافقات الشحن الدولي</h1><p>التحكم في الدول التي يسمح للمتاجر المؤهلة بالشحن إليها بعد موافقة إدارة المنصة.</p></div></header><InternationalShippingReviews/></main>;
}