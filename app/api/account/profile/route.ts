import {NextResponse} from "next/server";
import {currentUserId} from "@/lib/auth/session";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";
import {saveAccountProfile,InactiveAccountError} from "@/lib/account/profile-update";
export async function PATCH(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const id=await currentUserId();if(!id)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const data=await request.json().catch(()=>null);
 const name=typeof data?.name==="string"?data.name.trim():"";
 const phone=typeof data?.phone==="string"?data.phone.trim():"";
 if(name.length<2||name.length>180||phone.length>32||phone&&!/^[+0-9 ()-]{5,32}$/.test(phone))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{
  await saveAccountProfile(db,id,name,phone||null);
  return NextResponse.json({ok:true});
 }catch(error){
  return NextResponse.json({ok:false,code:error instanceof InactiveAccountError?"UNAUTHENTICATED":"PROFILE_UNAVAILABLE"},{status:error instanceof InactiveAccountError?401:503});
 }finally{db.release();}
}
