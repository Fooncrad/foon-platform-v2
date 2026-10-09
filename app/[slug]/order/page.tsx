import {notFound} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {publicMenuData} from "@/lib/restaurant/public-menu";
import {validStoreSlug} from "@/scripts/store-slug.mjs";
import PublicMenu from "../public-menu";
import "../public-menu.css";
export default async function PublicOrderPage({params}:{params:Promise<{slug:string}>}){
 const {slug:raw}=await params,slug=raw.toLowerCase();if(!validStoreSlug(slug))notFound();
 const [rows]=await database().execute<RowDataPacket[]>("SELECT id,name FROM tenants WHERE slug=? AND status='active' LIMIT 1",[slug]);if(!rows[0])notFound();
 return <PublicMenu {...await publicMenuData({id:String(rows[0].id),name:String(rows[0].name)},slug)}/>;
}
