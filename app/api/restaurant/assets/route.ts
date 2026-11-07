import {isEmployeeAccount} from '@/lib/auth/account-surface';
import {randomUUID} from 'node:crypto';
import {NextResponse} from 'next/server';
import type {RowDataPacket} from 'mysql2/promise';
import {currentUserId} from '@/lib/auth/session';
import {requireTenantMembership} from '@/lib/auth/authorization';
import {requireAllAdditionalBranchesUnlocked} from "@/lib/restaurant/branch-pin";
import {tenantEntitlement} from '@/lib/plans/entitlements';
import {database} from '@/lib/db/mysql';
import {assertSameOrigin} from '@/lib/security/origin';
import {squareImage} from '@/lib/media/square-image';
import {assertTenantMediaSpace} from '@/lib/media/account-quota';
export const runtime='nodejs';
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:'FORBIDDEN'},{status:403});}
 const user=await currentUserId();if(!user)return NextResponse.json({ok:false},{status:401});let tenant:string;
 try{tenant=(await requireTenantMembership(user,request.headers.get('x-foon-tenant')??'',['owner','manager'])).tenantId;await requireAllAdditionalBranchesUnlocked(tenant,user);}catch{return NextResponse.json({ok:false},{status:403});}
 const [menu,logo,displays]=await Promise.all([tenantEntitlement(tenant,'digital_menu'),tenantEntitlement(tenant,'branding.logo'),tenantEntitlement(tenant,'display_advertising')]);if(!menu.enabled&&!logo.enabled&&!displays.enabled)return NextResponse.json({ok:false,code:'PLAN_FEATURE_REQUIRED'},{status:403});
 if(Number(request.headers.get('content-length')??0)>11*1048576)return NextResponse.json({ok:false,code:'IMAGE_TOO_LARGE'},{status:413});
 try{
  let bytes:Buffer;let mimeType='image/jpeg';
  if(request.headers.get('content-type')?.includes('application/json')){
   if(await isEmployeeAccount(user))return NextResponse.json({ok:false,code:'EMPLOYEE_OPERATIONAL_ACCESS_ONLY'},{status:403});
   const body=await request.json();if(typeof body.libraryId!=='string'||!/^[a-f0-9-]{36}$/i.test(body.libraryId))return NextResponse.json({ok:false},{status:400});
   const [existing]=await database().execute<RowDataPacket[]>('SELECT a.id,a.tenant_id,a.bytes FROM restaurant_assets a JOIN memberships m ON m.tenant_id=a.tenant_id AND m.user_id=? AND m.role=\'owner\' AND m.status=\'active\' WHERE a.id=? LIMIT 1',[user,body.libraryId]);
   if(existing[0]?.tenant_id===tenant)return NextResponse.json({ok:true,url:'/api/restaurant/assets/'+body.libraryId},{status:201});
   const [files]=await database().execute<RowDataPacket[]>('SELECT image_data AS bytes FROM user_media_library WHERE user_id=? AND id=?',[user,body.libraryId]);if(!files.length&&!existing.length)return NextResponse.json({ok:false,code:'IMAGE_NOT_FOUND'},{status:404});bytes=files[0]?.bytes??existing[0].bytes;
  }else{const form=await request.formData(),file=form.get('file');if(!(file instanceof File)||!file.size||file.size>10*1048576)return NextResponse.json({ok:false,code:'INVALID_MEDIA_FILE'},{status:400});const allowedAudio=new Set(['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/aac','audio/mp4','audio/ogg','audio/webm']);if(allowedAudio.has(file.type)){mimeType=file.type==='audio/mp3'?'audio/mpeg':file.type;bytes=Buffer.from(await file.arrayBuffer());}else if(file.type.startsWith('image/')){bytes=Buffer.from(await file.arrayBuffer());}else{return NextResponse.json({ok:false,code:'UNSUPPORTED_MEDIA_TYPE'},{status:415});}}
  const isAudio=mimeType.startsWith('audio/');const storedBytes=isAudio?bytes:await squareImage(bytes);const db=await database().getConnection();try{await db.beginTransaction();await db.execute('SELECT id FROM tenants WHERE id=? FOR UPDATE',[tenant]);const policy=await assertTenantMediaSpace(db,tenant,storedBytes.length);if(storedBytes.length>policy.maxFileMb*1048576)throw Error('IMAGE_TOO_LARGE');const id=randomUUID();await db.execute('INSERT INTO restaurant_assets(id,tenant_id,mime_type,bytes,size_bytes) VALUES (?,?,?,?,?)',[id,tenant,mimeType,storedBytes,storedBytes.length]);await db.execute('INSERT INTO restaurant_audit_events(tenant_id,actor_user_id,action,resource_id,metadata) VALUES (?,?,\'asset.upload\',?,?)',[tenant,user,id,JSON.stringify({size:storedBytes.length,mimeType})]);await db.commit();return NextResponse.json({ok:true,url:'/api/restaurant/assets/'+id,mimeType},{status:201});}catch(e){await db.rollback();throw e;}finally{db.release();}
 }catch(e){const code=e instanceof Error?e.message:'';return NextResponse.json({ok:false,code:['STORAGE_LIMIT_REACHED','LIBRARY_DISABLED','IMAGE_TOO_LARGE','UNSUPPORTED_MEDIA_TYPE','INVALID_MEDIA_FILE'].includes(code)?code:'INVALID_MEDIA'},{status:code==='STORAGE_LIMIT_REACHED'||code==='LIBRARY_DISABLED'?409:400});}
}
