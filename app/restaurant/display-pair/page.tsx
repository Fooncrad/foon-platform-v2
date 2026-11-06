import {redirect} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";
import DisplayPairClient from "./display-pair-client";
export const dynamic="force-dynamic";
type Tenant={id:string;name:string;branches:{id:string;name:string}[]};
export default async function RestaurantDisplayPairPage({searchParams}:{searchParams:Promise<{code?:string}>}){
 const {code=""}=await searchParams;
 const user=await currentUserId();
 if(!user)redirect("/login?next="+encodeURIComponent("/restaurant/display-pair?code="+code));
 if(!/^\d{8}$/.test(code))return <main dir="rtl" style={{padding:32,fontFamily:"Arial,sans-serif"}}><h1>رمز الربط غير صالح</h1><p>امسح رمز QR الظاهر على شاشة التلفزيون مرة أخرى.</p></main>;
 const db=database();
 const [rows]=await db.execute<RowDataPacket[]>("SELECT t.id,t.name FROM memberships m JOIN tenants t ON t.id=m.tenant_id AND t.status='active' WHERE m.user_id=? AND m.status='active' AND m.role IN ('owner','manager') ORDER BY m.created_at",[user]);
 const ids=rows.map(row=>String(row.id));
 let branches:RowDataPacket[]=[];
 if(ids.length){const [found]=await db.execute<RowDataPacket[]>("SELECT id,tenant_id,name FROM branches WHERE tenant_id IN ("+ids.map(()=>"?").join(",")+") AND enabled=TRUE ORDER BY created_at",[...ids]);branches=found;}
 const tenants:Tenant[]=rows.map(row=>({id:String(row.id),name:String(row.name),branches:branches.filter(b=>String(b.tenant_id)===String(row.id)).map(b=>({id:String(b.id),name:String(b.name)}))}));
 if(!tenants.length)return <main dir="rtl" style={{padding:32,fontFamily:"Arial,sans-serif"}}><h1>لا يوجد نشاط يمكنك ربط الشاشة به</h1><p>يلزم حساب مالك أو مدير للنشاط.</p></main>;
 return <DisplayPairClient code={code} tenants={tenants}/>;
}
