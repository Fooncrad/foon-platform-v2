import {NextResponse} from 'next/server';
import {currentUserId} from '@/lib/auth/session';
import {database} from '@/lib/db/mysql';
import {assertSameOrigin} from '@/lib/security/origin';
export async function PATCH(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false},{status:403});}
 const id=await currentUserId();if(!id)return NextResponse.json({ok:false},{status:401});
 const body=await request.json().catch(()=>null);if(!['ar','en','fr'].includes(body?.language))return NextResponse.json({ok:false},{status:400});
 await database().execute('UPDATE users SET default_locale=? WHERE id=?',[body.language,id]);return NextResponse.json({ok:true});
}
