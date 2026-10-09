import {NextResponse} from "next/server";
import {currentUserId} from "@/lib/auth/session";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";
export async function PATCH(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const id=await currentUserId();if(!id)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const data=await request.json().catch(()=>null);
 const name=typeof data?.name==="string"?data.name.trim():"";
 const phone=typeof data?.phone==="string"?data.phone.trim():"";
 if(name.length<2||name.length>180||phone.length>32||phone&&!/^[+0-9 ()-]{5,32}$/.test(phone))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{const db=database();await db.execute("UPDATE users SET display_name=? WHERE id=? AND status='active'",[name,id]);await db.execute("INSERT INTO user_profiles(user_id,phone) VALUES (?,?) ON DUPLICATE KEY UPDATE phone=VALUES(phone)",[id,phone||null]);return NextResponse.json({ok:true});}catch{return NextResponse.json({ok:false,code:"PROFILE_UNAVAILABLE"},{status:503});}
}
