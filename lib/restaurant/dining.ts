import type {PoolConnection,RowDataPacket} from 'mysql2/promise';
import {createHash} from 'node:crypto';
import {ResourceError} from '@/scripts/restaurant-resource-schema.mjs';
type Data=Record<string,string|number|null>;
const json=(value:unknown):Data=>typeof value==='string'?JSON.parse(value):value as Data;
export async function diningSection(db:PoolConnection,tenant:string,branch:string|null,id:string){
 const [rows]=await db.execute<RowDataPacket[]>("SELECT id,name,branch_id,data FROM restaurant_resources WHERE tenant_id=? AND id=? AND kind='dining_section' AND archived=FALSE AND status='active' LIMIT 1 LOCK IN SHARE MODE",[tenant,id]);
 if(!rows.length||rows[0].branch_id&&rows[0].branch_id!==branch)throw new ResourceError('SECTION_NOT_FOUND');
 return {id:String(rows[0].id),name:String(rows[0].name),branchId:rows[0].branch_id?String(rows[0].branch_id):null,data:json(rows[0].data)};
}
export async function diningTable(db:PoolConnection,tenant:string,branch:string,id:string,party?:number){
 const [rows]=await db.execute<RowDataPacket[]>("SELECT id,name,branch_id,data FROM restaurant_resources WHERE tenant_id=? AND id=? AND kind='dining_table' AND archived=FALSE AND status<>'inactive' FOR UPDATE",[tenant,id]);
 if(!rows.length||rows[0].branch_id&&rows[0].branch_id!==branch)throw new ResourceError('TABLE_NOT_FOUND');
 const data=json(rows[0].data);
 if(party!==undefined&&(!Number.isInteger(party)||party<1||party>Number(data.capacity)))throw new ResourceError('TABLE_CAPACITY_EXCEEDED');
 const section=data.sectionId?await diningSection(db,tenant,branch,String(data.sectionId)):null;
 return {id:String(rows[0].id),name:String(rows[0].name),capacity:Number(data.capacity),sectionId:section?String(section.id):null,sectionName:section?String(section.name):'الصالة الرئيسية',number:data.number??rows[0].name};
}
export async function prepareDiningResource(db:PoolConnection,tenant:string,module:string,input:{name:string;status:string;branchId:string|null;data:Data},id:string){
 const d=input.data;
 if(module==='sections'){
  if(!input.branchId)throw new ResourceError('INVALID_BRANCH');
  for(const [key,role] of [['waiterId','waiter'],['supervisorId','manager']]){
   if(!d[key])continue;
   const [staff]=await db.execute<RowDataPacket[]>("SELECT r.id FROM restaurant_resources r JOIN memberships m ON m.tenant_id=r.tenant_id AND m.user_id=JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.userId')) AND m.status='active' AND m.role IN ("+(role==='manager'?"'manager','owner','supervisor'":"'waiter'")+") WHERE r.tenant_id=? AND r.id=? AND r.kind='employee' AND r.archived=FALSE AND r.status='active' AND (r.branch_id=? OR r.branch_id IS NULL) LIMIT 1 LOCK IN SHARE MODE",[tenant,d[key],input.branchId]);
   if(!staff.length)throw new ResourceError('INVALID_SECTION_STAFF');
  }
 }
 if(d.sectionId)await diningSection(db,tenant,input.branchId,String(d.sectionId));
 if(module==='tables'){
  await db.execute('SELECT id FROM tenants WHERE id=? FOR UPDATE',[tenant]);
  // Older unassigned tables remain usable until staff assigns their section and number.
  const canonical=(name:string)=>name.normalize('NFKC').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).trim().toLowerCase();
  const inferred=canonical(input.name).match(/(?:^|\s)(\d+)$/)?.[1];
  const number=d.number??(inferred?Number(inferred):canonical(input.name));
  const [others]=await db.execute<RowDataPacket[]>("SELECT id,name,branch_id,data FROM restaurant_resources WHERE tenant_id=? AND kind='dining_table' AND archived=FALSE AND id<>?",[tenant,id]);
  if(others.some(row=>{const other=json(row.data),old=other.number??(canonical(row.name).match(/(?:^|\s)(\d+)$/)?.[1]?Number(canonical(row.name).match(/(?:^|\s)(\d+)$/)![1]):canonical(row.name));return String(other.sectionId??row.branch_id??'main')===String(d.sectionId??input.branchId??'main')&&String(old)===String(number);}))throw new ResourceError('TABLE_NUMBER_EXISTS');
  return 'table:'+String(d.sectionId??input.branchId??'main')+':'+createHash('sha256').update(String(number)).digest('hex');
 }
 if(['waiterCalls','reservations'].includes(module)&&d.tableId){
  const table=await diningTable(db,tenant,String(input.branchId??''),String(d.tableId),module==='reservations'?Number(d.partySize):undefined);
  if(d.sectionId&&d.sectionId!==table.sectionId)throw new ResourceError('SECTION_TABLE_MISMATCH');
  d.sectionId=table.sectionId;
 }
 if(module==='reservations'){
  d.scheduledAt=new Date(String(d.scheduledAt)).toISOString();
  d.durationMinutes=d.durationMinutes??90;
  if(d.tableId&&['pending','confirmed','seated'].includes(input.status)){
   const [unfinished]=await db.execute<RowDataPacket[]>(
    "SELECT id FROM restaurant_orders WHERE tenant_id=? AND table_id=? AND (status IS NULL OR status NOT IN ('completed','cancelled','delivered','refunded','rejected')) LIMIT 1 FOR UPDATE",
    [tenant,d.tableId]
   );
   if(unfinished.length)throw new ResourceError('TABLE_HAS_UNFINISHED_ORDER');
  }
  if(d.tableId&&['pending','confirmed','seated'].includes(input.status)){
   const start=Date.parse(String(d.scheduledAt)),end=start+Number(d.durationMinutes)*60000;
   const [conflicts]=await db.execute<RowDataPacket[]>("SELECT id,data FROM restaurant_resources WHERE tenant_id=? AND kind='reservation' AND archived=FALSE AND status IN ('pending','confirmed','seated') AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.tableId'))=? AND id<>? FOR UPDATE",[tenant,d.tableId,id]);
   if(conflicts.some(row=>{const other=json(row.data),a=Date.parse(String(other.scheduledAt)),b=a+Number(other.durationMinutes??90)*60000;return start<b&&end>a;}))throw new ResourceError('BOOKING_CONFLICT');
  }
 }
 return module==='sections'?'section:'+input.branchId+':'+createHash('sha256').update(input.name.normalize('NFKC').trim().toLowerCase()).digest('hex'):null;
}
