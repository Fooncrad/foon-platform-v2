import {NextResponse} from 'next/server';
import type {RowDataPacket} from 'mysql2/promise';
import {database} from '@/lib/db/mysql';
import {currentActiveAdminUserId} from '@/lib/auth/session';
import {requirePlatformRole} from '@/lib/auth/authorization';
import {assertSameOrigin} from '@/lib/security/origin';
import {mediaPolicy,mediaUsage} from '@/lib/media/account-quota';
async function authorize(){const user=await currentActiveAdminUserId();if(!user)return false;try{await requirePlatformRole(user,['super_admin']);return true;}catch{return false;}}
export async function GET(request:Request){
 if(!await authorize())return NextResponse.json({ok:false},{status:403});
 const email=new URL(request.url).searchParams.get('email')?.trim();if(!email||email.length>254)return NextResponse.json({ok:false,code:'EMAIL_REQUIRED'},{status:400});
 const db=database();try{const [users]=await db.execute<RowDataPacket[]>('SELECT id,email,display_name AS name FROM users WHERE email=? LIMIT 1',[email]);if(!users.length)return NextResponse.json({ok:false,code:'ACCOUNT_NOT_FOUND'},{status:404});const user=users[0],policy=await mediaPolicy(String(user.id));const [limits]=await db.execute<RowDataPacket[]>('SELECT user_id FROM media_account_limits WHERE user_id=?',[user.id]);return NextResponse.json({ok:true,user,policy,usage:await mediaUsage(db,String(user.id)),custom:limits.length>0},{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({ok:false,code:'MEDIA_UNAVAILABLE'},{status:503});}
}
export async function PUT(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false},{status:403});}if(!await authorize())return NextResponse.json({ok:false},{status:403});
 const b=await request.json().catch(()=>null);if(typeof b?.userId!=='string'||!/^[a-f0-9-]{36}$/i.test(b.userId)||typeof b.reset!=='boolean')return NextResponse.json({ok:false},{status:400});
 if(!b.reset&&(!Number.isInteger(b.maxFiles)||b.maxFiles<1||b.maxFiles>10000||!Number.isInteger(b.maxStorageMb)||b.maxStorageMb<1||b.maxStorageMb>10000||!Number.isInteger(b.maxFileMb)||b.maxFileMb<1||b.maxFileMb>10||typeof b.enabled!=='boolean'))return NextResponse.json({ok:false},{status:400});
 try{const db=database();const [users]=await db.execute<RowDataPacket[]>('SELECT id FROM users WHERE id=?',[b.userId]);if(!users.length)return NextResponse.json({ok:false},{status:404});if(b.reset)await db.execute('DELETE FROM media_account_limits WHERE user_id=?',[b.userId]);else await db.execute('INSERT INTO media_account_limits(user_id,max_files,max_storage_mb,max_file_mb,enabled) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE max_files=VALUES(max_files),max_storage_mb=VALUES(max_storage_mb),max_file_mb=VALUES(max_file_mb),enabled=VALUES(enabled)',[b.userId,b.maxFiles,b.maxStorageMb,b.maxFileMb,b.enabled]);return NextResponse.json({ok:true});}catch{return NextResponse.json({ok:false},{status:503});}
}
