import {redirect} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";

export default async function AccountPage(){
 const id=await currentUserId();
 if(!id)redirect("/login");
 const [admins]=await database().execute<RowDataPacket[]>("SELECT pa.role FROM platform_admins pa JOIN users u ON u.id=pa.user_id WHERE pa.user_id=? AND pa.enabled=TRUE AND u.status='active' LIMIT 1",[id]);
 if(admins.length)redirect("/admin");
 const [memberships]=await database().execute<RowDataPacket[]>("SELECT m.tenant_id FROM memberships m JOIN tenants t ON t.id=m.tenant_id JOIN users u ON u.id=m.user_id WHERE m.user_id=? AND m.status='active' AND t.status='active' AND u.status='active' ORDER BY m.created_at LIMIT 1",[id]);
 if(memberships.length)redirect("/restaurant");
 redirect("/customer");
}
