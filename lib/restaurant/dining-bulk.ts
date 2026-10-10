import type {PoolConnection,RowDataPacket} from 'mysql2/promise';
import {saveResource} from './operations';
import {ResourceError} from '@/scripts/restaurant-resource-schema.mjs';
import {tenantEntitlement} from '@/lib/plans/entitlements';
export async function createDiningBatch(db:PoolConnection,tenant:string,user:string,role:string,body:Record<string,unknown>){
 if(!['owner','manager'].includes(role))throw new ResourceError('FORBIDDEN');
 const sections=body.sections as {id?:string;name:string;waiterId?:string;supervisorId?:string;start:number;count:number;capacity:number}[];
 if(typeof body.branchId!=='string'||!Array.isArray(sections)||!sections.length||sections.length>20||sections.some(s=>!s||typeof s.name!=='string'||!s.name.trim()||!Number.isInteger(s.start)||s.start<1||!Number.isInteger(s.count)||s.count<1||s.count>100||s.start+s.count-1>100000||!Number.isInteger(s.capacity)||s.capacity<1||s.capacity>100))throw new ResourceError('INVALID_INPUT');
 const count=sections.reduce((n,s)=>n+s.count,0);if(count>200)throw new ResourceError('INVALID_INPUT');
 await db.execute('SELECT id FROM tenants WHERE id=? FOR UPDATE',[tenant]);
 const grant=await tenantEntitlement(tenant,'tables');if(!grant.enabled)throw new ResourceError('PLAN_FEATURE_REQUIRED');
 const [[used]]=await db.execute<RowDataPacket[]>("SELECT COUNT(*) AS n FROM restaurant_resources WHERE tenant_id=? AND kind='dining_table' AND archived=FALSE",[tenant]);
 if(grant.limit!==null&&Number(used.n)+count>grant.limit)throw new ResourceError('PLAN_LIMIT_REACHED');
 const ids=[];
 for(const s of sections){
  let section=s.id;
  if(section){const [found]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_resources WHERE tenant_id=? AND id=? AND branch_id=? AND kind='dining_section' AND status='active' AND archived=FALSE",[tenant,section,body.branchId]);if(!found.length)throw new ResourceError('SECTION_NOT_FOUND');}
  else section=(await saveResource(db,tenant,user,role,'sections',{name:s.name,status:'active',branchId:body.branchId,data:{waiterId:s.waiterId||null,supervisorId:s.supervisorId||null}})).id;
  for(let n=s.start;n<s.start+s.count;n++)ids.push((await saveResource(db,tenant,user,role,'tables',{name:'طاولة '+n,status:'available',branchId:body.branchId,data:{sectionId:section,number:n,capacity:s.capacity}})).id);
 }
 return {ids,count};
}
