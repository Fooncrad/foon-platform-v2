import {redirect} from "next/navigation";
import {currentUserId} from "@/lib/auth/session";
import {isEmployeeAccount} from "@/lib/auth/account-surface";
export default async function CreateBusinessLayout({children}:{children:React.ReactNode}){
 const user=await currentUserId();if(user&&await isEmployeeAccount(user))redirect("/restaurant");
 return children;
}
