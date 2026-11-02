import {database} from "@/lib/db/mysql";
import type {Pool,PoolConnection,RowDataPacket} from "mysql2/promise";
export type MediaPolicy={accountType:string;maxFiles:number;maxStorageMb:number;maxFileMb:number;enabled:boolean};
export async function mediaPolicy(userId:string,db:Pool|PoolConnection=database()):Promise<MediaPolicy>{

 const [admins]=await db.execute<RowDataPacket[]>("SELECT user_id FROM platform_admins WHERE user_id=? AND enabled=1 LIMIT 1",[userId]);
 let type="customer";
 if(admins.length)type="admin";
 else{
  const [members]=await db.execute<RowDataPacket[]>("SELECT role FROM memberships WHERE user_id=? AND status='active' ORDER BY (role='owner') DESC,(role='manager') DESC LIMIT 1",[userId]);
  const role=String(members[0]?.role??"");
  if(role==="owner"||role==="manager")type=role;
  else if(role)type="staff";
 }
 const [rows]=await db.execute<RowDataPacket[]>("SELECT max_files,max_storage_mb,max_file_mb,enabled FROM media_library_settings WHERE account_type=?",[type]);
 const [overrides]=await db.execute<RowDataPacket[]>("SELECT max_files,max_storage_mb,max_file_mb,enabled FROM media_account_limits WHERE user_id=?",[userId]);
 const row=overrides[0]??rows[0];
 return {accountType:type,maxFiles:Number(row?.max_files??20),maxStorageMb:Number(row?.max_storage_mb??20),maxFileMb:Number(row?.max_file_mb??2),enabled:row?Boolean(row.enabled):true};
}

export async function mediaUsage(db:Pool|PoolConnection,user:string){
 const [[library]]=await db.execute<RowDataPacket[]>("SELECT COUNT(*) AS files,COALESCE(SUM(size_bytes),0) AS bytes FROM user_media_library WHERE user_id=?",[user]);
 const [[assets]]=await db.execute<RowDataPacket[]>("SELECT COUNT(*) AS files,COALESCE(SUM(a.size_bytes),0) AS bytes FROM restaurant_assets a WHERE EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=a.tenant_id AND m.user_id=? AND m.role='owner' AND m.status='active')",[user]);
 return {files:Number(library.files)+Number(assets.files),bytes:Number(library.bytes)+Number(assets.bytes)};
}
export async function assertMediaSpace(db:PoolConnection,user:string,bytes:number,files=1){
 const [users]=await db.execute<RowDataPacket[]>("SELECT id FROM users WHERE id=? AND status='active' FOR UPDATE",[user]);if(!users.length)throw Error('MEDIA_ACCOUNT_UNAVAILABLE');
 const policy=await mediaPolicy(user,db),usage=await mediaUsage(db,user);
 if(!policy.enabled)throw Error('LIBRARY_DISABLED');
 if(bytes>policy.maxFileMb*1048576&&files===1)throw Error('IMAGE_TOO_LARGE');
 if(usage.files+files>policy.maxFiles||usage.bytes+bytes>policy.maxStorageMb*1048576)throw Error('STORAGE_LIMIT_REACHED');
 return policy;
}
export async function tenantMediaOwner(db:PoolConnection,tenant:string){
 const [owners]=await db.execute<RowDataPacket[]>("SELECT user_id FROM memberships WHERE tenant_id=? AND role='owner' AND status='active' ORDER BY created_at,user_id LIMIT 1",[tenant]);
 if(!owners.length)throw Error('MEDIA_OWNER_REQUIRED');return String(owners[0].user_id);
}
export async function assertTenantMediaSpace(db:PoolConnection,tenant:string,bytes:number){return assertMediaSpace(db,await tenantMediaOwner(db,tenant),bytes);}
