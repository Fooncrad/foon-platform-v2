import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";
export const runtime="nodejs";
function parseCsv(input:string):string[][]{
 const rows:string[][]=[];let row:string[]=[],cell="",quoted=false;
 const s=input.replace(/^\uFEFF/,"");
 for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
 else if(c===","&&!quoted){row.push(cell.trim());cell=""}
 else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&s[i+1]==="\n")i++;row.push(cell.trim());cell="";if(row.some(Boolean))rows.push(row);row=[]}
 else cell+=c;}
 if(quoted)throw Error("CSV_UNCLOSED_QUOTE");row.push(cell.trim());if(row.some(Boolean))rows.push(row);return rows;
}
export async function POST(request:Request){
 try{assertSameOrigin(request)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const user=await currentUserId();if(!user)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const tenant=request.headers.get("x-foon-tenant")||"";
 let tenantId:string;try{tenantId=(await requireTenantMembership(user,tenant,["owner","manager"])).tenantId}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const body=await request.json().catch(()=>null);const kind=body?.kind;
 if(!["categories","items"].includes(kind)||typeof body?.csv!=="string"||body.csv.length>250000)return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 let rows:string[][];try{rows=parseCsv(body.csv)}catch{return NextResponse.json({ok:false,code:"INVALID_CSV"},{status:400})}
 if(rows.length<2||rows.length>501)return NextResponse.json({ok:false,code:"CSV_ROW_LIMIT",maxRows:500},{status:400});
 const header=rows.shift()!.map(x=>x.toLowerCase().trim());const required=kind==="categories"?["name"]:["category","name","price"];
 if(required.some(x=>!header.includes(x)))return NextResponse.json({ok:false,code:"CSV_HEADERS_REQUIRED",required},{status:400});
 const entries=rows.map(row=>Object.fromEntries(header.map((h,i)=>[h,row[i]||""])));
 for(const e of entries){if(!e.name||e.name.length>180||(kind==="items"&&(!e.category||!e.price||!/^[0-9]{1,10}(\.[0-9]{1,2})?$/.test(e.price)||Number(e.price)>9999999999.99||(e.description||"").length>5000)))return NextResponse.json({ok:false,code:"INVALID_CSV_ROW",row:entries.indexOf(e)+2},{status:400})}
 const db=await database().getConnection();
 try{await db.beginTransaction();const [tenants]=await db.execute<RowDataPacket[]>("SELECT kind FROM tenants WHERE id=? AND status='active' LIMIT 1",[tenantId]);if(tenants[0]?.kind!=="restaurant")throw Error("RESTAURANT_ONLY");
 let created=0;
 if(kind==="categories"){for(const e of entries){await db.execute("INSERT INTO restaurant_menu_categories(id,tenant_id,name) VALUES (?,?,?)",[randomUUID(),tenantId,e.name]);created++}}
 else {const [categories]=await db.execute<RowDataPacket[]>("SELECT id,name FROM restaurant_menu_categories WHERE tenant_id=? AND enabled=1",[tenantId]);const map=new Map(categories.map(c=>[String(c.name).trim(),String(c.id)]));
 for(const e of entries){const categoryId=map.get(e.category.trim());if(!categoryId){await db.rollback();return NextResponse.json({ok:false,code:"CATEGORY_NOT_FOUND",category:e.category},{status:400})}
 await db.execute("INSERT INTO restaurant_menu_items(id,tenant_id,category_id,name,description,price,currency) VALUES (?,?,?,?,?,?,'SAR')",[randomUUID(),tenantId,categoryId,e.name,e.description||null,e.price]);created++}}
 await db.commit();return NextResponse.json({ok:true,created},{status:201})
 }catch{await db.rollback();return NextResponse.json({ok:false,code:"BULK_IMPORT_FAILED"},{status:503})}finally{db.release()}
}
