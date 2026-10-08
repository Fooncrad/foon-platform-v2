import {notFound} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import CustomerForm from "./customer-form";
export default async function StoreCustomerRegistration({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;
 const [rows]=await database().execute<RowDataPacket[]>("SELECT name,slug FROM tenants WHERE slug=? AND status='active' LIMIT 1",[slug]);
 if(!rows.length)notFound();
 return <CustomerForm slug={String(rows[0].slug)} name={String(rows[0].name)}/>;
}
