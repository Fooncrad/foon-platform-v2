import {isEmployeeAccount} from '@/lib/auth/account-surface';
import {createHash,randomUUID} from 'node:crypto';
import {NextResponse} from 'next/server';
import type {RowDataPacket} from 'mysql2/promise';
import {database} from '@/lib/db/mysql';
import {currentUserId} from '@/lib/auth/session';
import {requireTenantMembership} from '@/lib/auth/authorization';
import {assertSameOrigin} from '@/lib/security/origin';
import {readLimitedJson} from '@/lib/security/limited-json';
import {requireAllAdditionalBranchesUnlocked} from "@/lib/restaurant/branch-pin";
import {tenantEntitlement} from '@/lib/plans/entitlements';
import {importKinds,validateImportRows,type ImportKind,type ImportRow} from '@/lib/catalog/import-csv';
import {importBatch} from '@/lib/catalog/import-batch';
import {remoteImage} from '@/lib/media/remote-image';
import {squareImage} from '@/lib/media/square-image';
import {assertTenantMediaSpace,tenantMediaOwner} from '@/lib/media/account-quota';
export const runtime='nodejs';
const fail=(code:string,status=400)=>NextResponse.json({ok:false,code},{status});
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return fail('FORBIDDEN',403);}const user=await currentUserId();if(!user)return fail('UNAUTHENTICATED',401);
 const tenant=request.headers.get('x-foon-tenant')??'';try{await requireTenantMembership(user,tenant,['owner','manager']);await requireAllAdditionalBranchesUnlocked(tenant,user);}catch{return fail('FORBIDDEN',403);}
 let body:Record<string,unknown>|null;
 try{const parsed=await readLimitedJson(request,200000);body=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed as Record<string,unknown>:null;}
 catch(e){return e instanceof Error&&e.message==='BATCH_TOO_LARGE'?fail('BATCH_TOO_LARGE',413):fail('INVALID_INPUT');}
 if(!body||!importKinds.includes(body.kind as ImportKind)||!Array.isArray(body.rows)||body.rows.length<1||body.rows.length>5||typeof body.requestKey!=='string'||!/^[a-z0-9-]{36,100}$/i.test(body.requestKey))return fail('INVALID_INPUT');
 const kind=body.kind as ImportKind,rows=body.rows as ImportRow[];try{validateImportRows(kind,rows);}catch(e){return fail(e instanceof Error?e.message:'INVALID_ROW');}
 const pool=database(),hash=createHash('sha256').update(JSON.stringify({kind,rows})).digest('hex');
 const [profiles]=await pool.execute<RowDataPacket[]>('SELECT t.kind,p.activity_code,p.currency FROM tenants t LEFT JOIN tenant_business_profiles p ON p.tenant_id=t.id WHERE t.id=? AND t.status=\'active\'',[tenant]);if(!profiles.length)return fail('FORBIDDEN',403);
 const profile=profiles[0],restaurant=profile.activity_code==='restaurant'||!profile.activity_code&&profile.kind==='restaurant';
 if(restaurant&&kind==='variants')return fail('VARIANTS_NOT_APPLICABLE');
 const service=['carwash','laundry','automotive','salon','publicworks'].includes(String(profile.activity_code));
 const feature=['groups','values','variants'].includes(kind)?'variants':service?'catalog':'digital_menu';if(!(await tenantEntitlement(tenant,feature)).enabled)return fail('PLAN_FEATURE_REQUIRED',403);
 const [done]=await pool.execute<RowDataPacket[]>('SELECT payload_hash,result FROM catalog_import_batches WHERE tenant_id=? AND request_key=?',[tenant,body.requestKey]);
 if(done.length){if(done[0].payload_hash!==hash)return fail('IMPORT_KEY_CONFLICT',409);return NextResponse.json(typeof done[0].result==='string'?JSON.parse(done[0].result):done[0].result);}
 const sources=[...new Set(rows.flatMap(r=>[r.image_1,r.image_2,r.image_3,r.image_4].filter(Boolean)))],prepared=new Map<string,Buffer>();
 const imageWarnings:string[]=[];
 if(sources.some(source=>source.startsWith('/api/account/library/'))&&await isEmployeeAccount(user))return fail('EMPLOYEE_OPERATIONAL_ACCESS_ONLY',403);
 for(let index=0;index<sources.length;index+=4)await Promise.all(sources.slice(index,index+4).map(async source=>{try{
  let bytes:Buffer;if(source.startsWith('/api/account/library/')){const id=source.split('/').at(-1)!;const [found]=await pool.execute<RowDataPacket[]>('SELECT image_data AS bytes FROM user_media_library WHERE user_id=? AND id=? UNION ALL SELECT a.bytes FROM restaurant_assets a JOIN memberships m ON m.tenant_id=a.tenant_id AND m.user_id=? AND m.role=\'owner\' AND m.status=\'active\' WHERE a.id=? LIMIT 1',[user,id,user,id]);if(!found.length)throw Error('LIBRARY_IMAGE_NOT_FOUND');bytes=found[0].bytes;}else bytes=await remoteImage(source);prepared.set(source,await squareImage(bytes));
 }catch(e){imageWarnings.push(e instanceof Error?e.message:'INVALID_OR_UNREACHABLE_IMAGE');}}));
 const db=await pool.getConnection();
 try{await db.beginTransaction();await db.execute('SELECT id FROM tenants WHERE id=? FOR UPDATE',[tenant]);
  const [replay]=await db.execute<RowDataPacket[]>('SELECT payload_hash,result FROM catalog_import_batches WHERE tenant_id=? AND request_key=?',[tenant,body.requestKey]);if(replay.length){await db.rollback();if(replay[0].payload_hash!==hash)return fail('IMPORT_KEY_CONFLICT',409);return NextResponse.json(typeof replay[0].result==='string'?JSON.parse(replay[0].result):replay[0].result);}
  const urls=new Map<string,string>();if(prepared.size){await tenantMediaOwner(db,tenant);for(const [source,bytes] of prepared){await assertTenantMediaSpace(db,tenant,bytes.length);const id=randomUUID();await db.execute('INSERT INTO restaurant_assets(id,tenant_id,mime_type,bytes,size_bytes) VALUES (?,?,\'image/jpeg\',?,?)',[id,tenant,bytes,bytes.length]);urls.set(source,'/api/restaurant/assets/'+id);}}
  const imported=await importBatch(db,tenant,user,restaurant,String(profile.activity_code),String(profile.currency||'SAR'),kind,rows,urls),result={ok:true,created:imported.ids.length,skipped:imported.skipped,imageWarnings:imageWarnings.length,ids:imported.ids};
  await db.execute('INSERT INTO catalog_import_batches(tenant_id,request_key,payload_hash,result) VALUES (?,?,?,?)',[tenant,body.requestKey,hash,JSON.stringify(result)]);await db.execute('INSERT INTO restaurant_audit_events(tenant_id,actor_user_id,action,metadata) VALUES (?,?,\'catalog.import\',?)',[tenant,user,JSON.stringify({kind,created:imported.ids.length,skipped:imported.skipped,imageWarnings:imageWarnings.length})]);await db.commit();return NextResponse.json(result,{status:201});
 }catch(e){await db.rollback();const error=e as Error&{code?:string};const code=error.code==='ER_DUP_ENTRY'?'DUPLICATE_SKU_OR_COMBINATION':error.message;return fail(/^[A-Z_]+$/.test(code)?code:'IMPORT_FAILED',code==='STORAGE_LIMIT_REACHED'?409:400);}finally{db.release();}
}
