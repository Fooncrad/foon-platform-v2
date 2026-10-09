import {database} from "@/lib/db/mysql";
import type {RowDataPacket} from "mysql2/promise";
export type MediaPolicy={accountType:string;maxFiles:number;maxStorageMb:number;maxFileMb:number;enabled:boolean};
export async function mediaPolicy(userId:string):Promise<MediaPolicy>{
 const db=database();
 const [admins]=await db.execute<RowDataPacket[]>("SELECT user_id FROM platform_admins WHERE user_id=? AND enabled=1 LIMIT 1",[userId]);
 let type="customer";
 if(admins.length)type="admin";
 else{
  const [members]=await db.execute<RowDataPacket[]>("SELECT role FROM memberships WHERE user_id=? AND status='active' ORDER BY FIELD(role,'owner','manager') LIMIT 1",[userId]);
  const role=String(members[0]?.role??"");
  if(role==="owner"||role==="manager")type=role;
  else if(role)type="staff";
 }
 const [rows]=await db.execute<RowDataPacket[]>("SELECT max_files,max_storage_mb,max_file_mb,enabled FROM media_library_settings WHERE account_type=?",[type]);
 const row=rows[0];
 return {accountType:type,maxFiles:Number(row?.max_files??20),maxStorageMb:Number(row?.max_storage_mb??20),maxFileMb:Number(row?.max_file_mb??2),enabled:row?Boolean(row.enabled):true};
}
