import {redirect} from "next/navigation";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import LandingEditor from "./landing-editor";
export default async function LandingEditorPage(){
 const id=await currentActiveAdminUserId();if(!id)redirect("/login");
 const {role}=await requirePlatformRole(id,["super_admin","admin","support"]);
 return <main className="workspace"><LandingEditor canEdit={role!=="support"}/></main>;
}