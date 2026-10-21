import Link from "next/link";
import {redirect} from "next/navigation";
import {currentUserId} from "@/lib/auth/session";
import {customerCreatorUserId} from "@/lib/creator/authorization";
import CreatorEditor from "./creator-editor";
import "./creator-editor.css";

export default async function CreatorProfilePage(){
 if(!await currentUserId())redirect("/login");
 if(!await customerCreatorUserId())redirect("/account");
 return <main className="creatorEditorPage"><nav><Link href="/customer">← حساب العميل</Link><Link href="/account/library">مكتبة صوري</Link></nav>
  <CreatorEditor/>
 </main>;
}
