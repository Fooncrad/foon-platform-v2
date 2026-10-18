import type {Pool,PoolConnection,RowDataPacket} from "mysql2/promise";
import {notifyCustomer} from "../notifications/customer.ts";
import {reservationNoShowDue} from "./reservation-policy.ts";

type Reservation={id:string;tenant_id:string;branch_id:string|null;name:string;status:string;data:unknown;version:number};
const json=(value:unknown):Record<string,unknown>=>typeof value==="string"?JSON.parse(value):value as Record<string,unknown>;

/** Mark only confirmed, due reservations. Each transition and customer notice
 * commits together; concurrent workers serialize on the reservation row. */
export async function markOverdueReservationsNoShow(pool:Pool,now=Date.now(),batchSize=500){
 if(!Number.isFinite(now)||!Number.isInteger(batchSize)||batchSize<1||batchSize>2000)throw new Error("INVALID_WORKER_ARGUMENT");
 let marked=0,scanned=0,skippedPreorder=0,cursorCreatedAt:Date|string|null=null,cursorId="";
 const cutoff=new Date(now).toISOString();
 for(;;){
  const [candidates]=await pool.execute<RowDataPacket[]>(
   "SELECT id,tenant_id,branch_id,name,status,data,version,created_at FROM restaurant_resources WHERE kind='reservation' AND archived=FALSE AND status='confirmed' AND JSON_VALID(data)=TRUE AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.scheduledAt'))<=? AND (? IS NULL OR created_at>? OR (created_at=? AND id>?)) ORDER BY created_at,id LIMIT ?",
   [cutoff,cursorCreatedAt,cursorCreatedAt,cursorCreatedAt,cursorId,batchSize]
  );
  scanned+=candidates.length;
  for(const candidate of candidates){
   const db:PoolConnection=await pool.getConnection();
   try{
    await db.beginTransaction();
    const [rows]=await db.execute<RowDataPacket[]>("SELECT id,tenant_id,branch_id,name,status,data,version FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='reservation' AND archived=FALSE FOR UPDATE",[candidate.id,candidate.tenant_id]);
    if(!rows.length||rows[0].status!=="confirmed"){await db.commit();continue;}
    const row=rows[0] as Reservation,details=json(row.data),branch=row.branch_id?String(row.branch_id):null;
    const [settings]=await db.execute<RowDataPacket[]>("SELECT data FROM restaurant_resources WHERE tenant_id=? AND kind='branch_config' AND archived=FALSE AND (branch_id=? OR branch_id IS NULL) ORDER BY (branch_id IS NOT NULL) DESC,created_at DESC LIMIT 1",[row.tenant_id,branch]);
    const config=settings[0]?json(settings[0].data):{};
    if(!reservationNoShowDue(details.scheduledAt,config.noShowGraceMinutes,now)){await db.commit();continue;}
    const [linked]=await db.execute<RowDataPacket[]>("SELECT status FROM restaurant_orders WHERE tenant_id=? AND reservation_id=? FOR UPDATE",[row.tenant_id,row.id]);
    if(linked.some(order=>String(order.status)!=="cancelled")){skippedPreorder++;await db.commit();continue;}
    const [updated]=await db.execute("UPDATE restaurant_resources SET status='no_show',version=version+1 WHERE id=? AND tenant_id=? AND kind='reservation' AND status='confirmed' AND version=?",[row.id,row.tenant_id,row.version]) as [{affectedRows:number},unknown];
    if(!updated.affectedRows){await db.commit();continue;}
    await db.execute("INSERT INTO restaurant_audit_events(tenant_id,actor_user_id,action,resource_id,metadata) VALUES (?,NULL,'reservation.auto_no_show',?,?)",[row.tenant_id,row.id,JSON.stringify({source:"scheduled_worker",branchId:branch,scheduledAt:details.scheduledAt,graceMinutes:config.noShowGraceMinutes==null?30:Number(config.noShowGraceMinutes)})]);
    const userId=typeof details.customerUserId==="string"?details.customerUserId:"";
    if(userId)await notifyCustomer(db,{userId,tenantId:String(row.tenant_id),event:"reservation_no_show",resourceId:String(row.id),reference:String(row.name??""),status:"no_show"});
    await db.commit();marked++;
   }catch(error){await db.rollback();throw error;}finally{db.release();}
  }
  if(candidates.length<batchSize)break;
  const last=candidates[candidates.length-1];cursorCreatedAt=last.created_at as Date|string;cursorId=String(last.id);
 }
 return {scanned,marked,skippedPreorder};
}
