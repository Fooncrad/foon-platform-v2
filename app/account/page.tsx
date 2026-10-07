import {redirect} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";

export default async function AccountPage(){
 const id=await currentUserId();
 if(!id)redirect("/login");
 const [admins]=await database().execute<RowDataPacket[]>("SELECT role FROM platform_admins WHERE user_id=? AND enabled=TRUE LIMIT 1",[id]);
 if(admins.length)redirect("/admin");
 const [memberships]=await database().execute<RowDataPacket[]>("SELECT tenant_id FROM memberships WHERE user_id=? AND status='active' ORDER BY created_at LIMIT 1",[id]);
 if(memberships.length)redirect("/restaurant");
 redirect("/");
}