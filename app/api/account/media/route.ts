import {NextResponse} from "next/server";
import sharp from "sharp";
import {currentUserId} from "@/lib/auth/session";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";
import type {RowDataPacket} from "mysql2/promise";
export const runtime="nodejs";
const fields={avatar:["avatar_image","avatar_mime"],logo:["logo_image","logo_mime"],cover:["cover_image","cover_mime"]} as const;
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const id=await currentUserId();if(!id)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 if(Number(request.headers.get("content-length")||0)>3*1024*1024)return NextResponse.json({ok:false,code:"IMAGE_TOO_LARGE"},{status:413});
 const form=await request.formData().catch(()=>null);const type=String(form?.get("type")??"");
 if(!(type in fields))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const file=form?.get("file");if(!(file instanceof File)||file.size<1||file.size>2*1024*1024)return NextResponse.json({ok:false,code:"INVALID_IMAGE"},{status:400});
 const bytes=Buffer.from(await file.arrayBuffer());const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;const webp=bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP";const mime=png?"image/png":jpg?"image/jpeg":webp?"image/webp":null;
 if(!mime||file.type!==mime)return NextResponse.json({ok:false,code:"INVALID_IMAGE"},{status:400});
 const square=await sharp(bytes).rotate().resize(800,800,{fit:"cover",position:"centre"}).jpeg({quality:82}).toBuffer();
 const [imageCol,mimeCol]=fields[type as keyof typeof fields];
 try{await database().execute(`INSERT INTO user_profiles(user_id,${imageCol},${mimeCol}) VALUES (?,?,?) ON DUPLICATE KEY UPDATE ${imageCol}=VALUES(${imageCol}),${mimeCol}=VALUES(${mimeCol})`,[id,square,"image/jpeg"]);return NextResponse.json({ok:true,url:"/api/account/media?type="+type});}catch{return NextResponse.json({ok:false,code:"UPLOAD_UNAVAILABLE"},{status:503});}
}
export async function GET(request:Request){
 const id=await currentUserId();if(!id)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const type=new URL(request.url).searchParams.get("type")??"";if(!(type in fields))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const [imageCol,mimeCol]=fields[type as keyof typeof fields];
 try{const [rows]=await database().execute<RowDataPacket[]>(`SELECT ${imageCol} AS image,${mimeCol} AS mime FROM user_profiles WHERE user_id=?`,[id]);const row=rows[0];if(!row?.image)return new Response(null,{status:404});return new Response(new Uint8Array(row.image as Buffer),{headers:{"content-type":String(row.mime),"cache-control":"private, no-store","x-content-type-options":"nosniff"}});}catch{return NextResponse.json({ok:false,code:"MEDIA_UNAVAILABLE"},{status:503});}
}
