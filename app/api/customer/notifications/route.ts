import {employeePersonalAccessDenied} from "@/lib/auth/account-surface";
import {NextResponse} from 'next/server';
import {currentUserId} from '@/lib/auth/session';
import {database} from '@/lib/db/mysql';
import {assertSameOrigin} from '@/lib/security/origin';
export async function POST(request:Request){
 const employeeDenied=await employeePersonalAccessDenied();if(employeeDenied)return employeeDenied;
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false},{status:403});}
 const user=await currentUserId();if(!user)return NextResponse.json({ok:false},{status:401});
 const body=await request.json().catch(()=>null);
 if(body?.all!==true&&!(typeof body?.id==='string'&&/^[a-f0-9-]{36}$/i.test(body.id)))return NextResponse.json({ok:false},{status:400});
 await database().execute('UPDATE customer_notifications SET read_at=COALESCE(read_at,NOW()) WHERE user_id=?'+(body.all===true?'':' AND id=?'),body.all===true?[user]:[user,body.id]);
 return NextResponse.json({ok:true});
}
