import {redirect} from "next/navigation";
import {currentUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";

export default async function AdminTemplate({children}:{children:React.ReactNode}){
 const userId=await currentUserId();
 if(!userId)redirect("/login");
 try{
  await requirePlatformRole(userId,["super_admin","admin","support"]);
 }catch{
  redirect("/account");
 }
 return <>{children}</>;
}
