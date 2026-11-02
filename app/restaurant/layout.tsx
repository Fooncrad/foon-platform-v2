import {currentUserId} from "@/lib/auth/session";
import {isEmployeeAccount} from "@/lib/auth/account-surface";
import {PersonalMediaScope} from "./personal-media-scope";
export default async function BusinessLayout({children}:{children:React.ReactNode}){
 const user=await currentUserId(),allowed=Boolean(user)&&!await isEmployeeAccount(user!);
 return <PersonalMediaScope allowed={allowed}>{children}</PersonalMediaScope>;
}
