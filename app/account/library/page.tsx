import Link from "next/link";
import {redirect} from "next/navigation";
import {currentUserId} from "@/lib/auth/session";
import MediaLibrary from "./media-library";
import "./style.css";
export default async function LibraryPage(){
 const user=await currentUserId();if(!user)redirect("/login");
 return <main className="foonMediaPage" dir="rtl"><nav><Link href="/account">حسابي</Link><Link href="/customer">حساب العميل</Link><Link href="/restaurant">لوحة النشاط</Link><Link href="/admin">لوحة الإدارة</Link></nav><h1>مكتبة الصور</h1><MediaLibrary/></main>
}
