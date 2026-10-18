import {randomUUID} from "node:crypto";
import {authenticateEdgeDevice,requireEdgePermission} from "./edge-device-auth.mjs";
import {printerDispatchAllowed} from "../restaurant/print-policy.mjs";

const headers={"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"};
const reply=(status,body)=>Response.json(body,{status,headers});
const uuid=/^[a-f0-9-]{36}$/i;

export function isPrivatePrinterAddress(value){
 if(typeof value!=="string"||value.length>45)return false;
 const parts=value.split(".");if(parts.length!==4||parts.some(part=>!/^\d{1,3}$/.test(part)))return false;
 const octets=parts.map(Number);if(octets.some(part=>part<0||part>255))return false;
 return octets[0]===10||octets[0]===192&&octets[1]===168||octets[0]===172&&octets[1]>=16&&octets[1]<=31;
}

async function authorize(connection,authorization,lock=false){
 const identity=await authenticateEdgeDevice(connection,authorization,lock);
 await requireEdgePermission(connection,identity,"printers","view",lock);
 const [plans]=await connection.execute("SELECT p.code,COALESCE(af.enabled,pf.enabled) AS enabled FROM tenant_subscriptions s JOIN package_plans p ON p.id=s.plan_id AND p.enabled=TRUE JOIN package_features f ON f.feature_key='departments' LEFT JOIN package_plan_features pf ON pf.plan_id=p.id AND pf.feature_key=f.feature_key LEFT JOIN tenant_business_profiles bp ON bp.tenant_id=s.tenant_id LEFT JOIN package_plan_activity_features af ON af.plan_id=p.id AND af.feature_key=f.feature_key AND af.activity_code=bp.activity_code WHERE s.tenant_id=? AND s.status='active' AND (s.starts_at IS NULL OR s.starts_at<=UTC_TIMESTAMP()) AND (s.ends_at IS NULL OR s.ends_at>UTC_TIMESTAMP()) LIMIT 1",[identity.tenantId]);
 if(!plans.length||!(plans[0].enabled===null?plans[0].code==="enterprise":Boolean(plans[0].enabled)))throw Error("PLAN_FEATURE_REQUIRED");
 return identity;
}

export async function claimPrintJob(request,{pool,enabled=false,leaseSeconds=90}={}){
 if(!enabled)return reply(503,{error:"PRINT_AGENT_NOT_CONFIGURED"});
 const authorization=request.headers.get("authorization");let identity;
 try{identity=await authorize(pool,authorization);}catch(error){return reply(error?.message==="DEVICE_UNAUTHORIZED"?401:error?.message==="EDGE_FORBIDDEN"||error?.message==="PLAN_FEATURE_REQUIRED"?403:503,{error:error?.message==="DEVICE_UNAUTHORIZED"?"DEVICE_UNAUTHORIZED":error?.message==="EDGE_FORBIDDEN"||error?.message==="PLAN_FEATURE_REQUIRED"?error.message:"PRINT_AGENT_UNAVAILABLE"});}
 const db=await pool.getConnection();
 try{
  await db.beginTransaction();
  const locked=await authorize(db,authorization,true);
  if(locked.deviceId!==identity.deviceId||locked.tenantId!==identity.tenantId||locked.branchId!==identity.branchId)throw Error("DEVICE_UNAUTHORIZED");
  await db.execute("UPDATE restaurant_print_jobs SET status='failed',last_error='LEASE_EXPIRED_MAX_ATTEMPTS',lease_token=NULL,lease_expires_at=NULL WHERE tenant_id=? AND (branch_id=? OR branch_id IS NULL) AND status='leased' AND lease_expires_at<=UTC_TIMESTAMP(3) AND attempts>=max_attempts",[identity.tenantId,identity.branchId]);
  const [candidates]=await db.execute("SELECT j.id,j.tenant_id,j.branch_id,j.printer_id,j.payload_json,j.attempts,j.max_attempts,r.name AS printer_name,r.status AS printer_status,r.branch_id AS printer_branch,r.data AS printer_data FROM restaurant_print_jobs j JOIN restaurant_resources r ON r.id=j.printer_id AND r.tenant_id=j.tenant_id AND r.kind='printer' AND r.archived=FALSE WHERE j.tenant_id=? AND (j.branch_id=? OR j.branch_id IS NULL) AND (r.branch_id=? OR r.branch_id IS NULL) AND r.status='active' AND JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.connection'))='network' AND JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.autoPrint'))='yes' AND j.attempts<j.max_attempts AND ((j.status IN ('pending','retry') AND j.available_at<=UTC_TIMESTAMP(3)) OR (j.status='leased' AND j.lease_expires_at<=UTC_TIMESTAMP(3))) ORDER BY j.created_at,j.id LIMIT 12 FOR UPDATE",[identity.tenantId,identity.branchId,identity.branchId]);
  let selected=null;
  for(const row of candidates){
   const config=typeof row.printer_data==="string"?JSON.parse(row.printer_data):row.printer_data;
   const payload=typeof row.payload_json==="string"?JSON.parse(row.payload_json):row.payload_json;
   if(!printerDispatchAllowed(payload,config)){
    await db.execute("UPDATE restaurant_print_jobs SET status='cancelled',last_error='PRINT_POLICY_CHANGED',lease_token=NULL,lease_expires_at=NULL WHERE id=? AND tenant_id=?",[row.id,identity.tenantId]);
    continue;
   }
   if(!isPrivatePrinterAddress(String(config?.address??""))){
    await db.execute("UPDATE restaurant_print_jobs SET status='failed',last_error='PRINTER_ADDRESS_INVALID',lease_token=NULL,lease_expires_at=NULL WHERE id=? AND tenant_id=?",[row.id,identity.tenantId]);
    await db.execute("INSERT INTO restaurant_print_attempts(job_id,attempt_number,agent_id,outcome,detail) VALUES (?,?,?,'failed','PRINTER_ADDRESS_INVALID')",[row.id,Number(row.attempts),identity.deviceId]);
    continue;
   }
   selected={row,config,payload};break;
  }
  if(!selected){await db.commit();return reply(200,{job:null});}
  const leaseToken=randomUUID(),expiresAt=new Date(Date.now()+Math.min(180,Math.max(30,leaseSeconds))*1000);
  const [result]=await db.execute("UPDATE restaurant_print_jobs SET status='leased',attempts=attempts+1,lease_token=?,lease_expires_at=?,last_error=NULL WHERE id=? AND tenant_id=?",[leaseToken,expiresAt,selected.row.id,identity.tenantId]);
  if(result.affectedRows!==1)throw Error("PRINT_JOB_CLAIM_CONFLICT");
  await db.execute("INSERT INTO restaurant_print_attempts(job_id,attempt_number,agent_id,outcome) VALUES (?,?,?,'claimed')",[selected.row.id,Number(selected.row.attempts)+1,identity.deviceId]);
  await db.commit();
  return reply(200,{job:{id:String(selected.row.id),leaseToken,leaseExpiresAt:expiresAt.toISOString(),payload:selected.payload,printer:{name:String(selected.row.printer_name),address:String(selected.config.address),paperWidth:Number(selected.config.paperWidth??80),copies:Number(selected.config.copies??1),purpose:String(selected.config.purpose),cutPaper:selected.config.cutPaper==="yes",headerText:String(selected.config.headerText??""),footerText:String(selected.config.footerText??"")}}});
 }catch(error){await db.rollback();if(error?.message==="DEVICE_UNAUTHORIZED")return reply(401,{error:"DEVICE_UNAUTHORIZED"});if(error?.message==="EDGE_FORBIDDEN"||error?.message==="PLAN_FEATURE_REQUIRED")return reply(403,{error:error.message});return reply(503,{error:"PRINT_AGENT_UNAVAILABLE"});}finally{db.release();}
}

export async function reportPrintJob(request,{pool,jobId,enabled=false}={}){
 if(!enabled)return reply(503,{error:"PRINT_AGENT_NOT_CONFIGURED"});
 if(!uuid.test(String(jobId??"")))return reply(400,{error:"INVALID_PRINT_JOB"});
 let input;try{input=await request.json();}catch{return reply(400,{error:"INVALID_PRINT_RESULT"});}
 if(!input||typeof input!=="object"||!uuid.test(String(input.leaseToken??""))||!['printed','failed'].includes(input.outcome)||input.error!==undefined&&typeof input.error!=="string")return reply(400,{error:"INVALID_PRINT_RESULT"});
 const authorization=request.headers.get("authorization"),db=await pool.getConnection();
 try{
  await db.beginTransaction();const identity=await authorize(db,authorization,true);
  const [rows]=await db.execute("SELECT id,tenant_id,branch_id,attempts,max_attempts,status,lease_token FROM restaurant_print_jobs WHERE id=? AND tenant_id=? AND (branch_id=? OR branch_id IS NULL) LIMIT 1 FOR UPDATE",[jobId,identity.tenantId,identity.branchId]);
  const job=rows[0];if(!job||job.status!=="leased"||job.lease_token!==input.leaseToken){await db.rollback();return reply(409,{error:"PRINT_LEASE_EXPIRED"});}
  const detail=String(input.error??"").slice(0,500)||null;
  if(input.outcome==="printed"){
   const [updated]=await db.execute("UPDATE restaurant_print_jobs SET status='printed',printed_at=UTC_TIMESTAMP(3),lease_token=NULL,lease_expires_at=NULL,last_error=NULL WHERE id=? AND tenant_id=? AND lease_token=?",[jobId,identity.tenantId,input.leaseToken]);
   if(updated.affectedRows!==1)throw Error("PRINT_LEASE_EXPIRED");
   await db.execute("INSERT INTO restaurant_print_attempts(job_id,attempt_number,agent_id,outcome) VALUES (?,?,?,'printed')",[jobId,Number(job.attempts),identity.deviceId]);
  }else{
   const final=Number(job.attempts)>=Number(job.max_attempts),delay=Math.min(300,2**Math.min(8,Number(job.attempts)));
   const [updated]=await db.execute("UPDATE restaurant_print_jobs SET status=?,available_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL "+delay+" SECOND),lease_token=NULL,lease_expires_at=NULL,last_error=? WHERE id=? AND tenant_id=? AND lease_token=?",[final?"failed":"retry",detail??"PRINTER_CONNECTION_FAILED",jobId,identity.tenantId,input.leaseToken]);
   if(updated.affectedRows!==1)throw Error("PRINT_LEASE_EXPIRED");
   await db.execute("INSERT INTO restaurant_print_attempts(job_id,attempt_number,agent_id,outcome,detail) VALUES (?,?,?,'failed',?)",[jobId,Number(job.attempts),identity.deviceId,detail]);
  }
  await db.commit();return reply(200,{ok:true,status:input.outcome==="printed"?"printed":Number(job.attempts)>=Number(job.max_attempts)?"failed":"retry"});
 }catch(error){await db.rollback();if(error?.message==="DEVICE_UNAUTHORIZED")return reply(401,{error:"DEVICE_UNAUTHORIZED"});if(error?.message==="EDGE_FORBIDDEN"||error?.message==="PLAN_FEATURE_REQUIRED")return reply(403,{error:error.message});return reply(503,{error:"PRINT_RESULT_UNAVAILABLE"});}finally{db.release();}
}
