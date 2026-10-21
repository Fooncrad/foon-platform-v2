import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {identifyTransferEvidence,TRANSFER_EVIDENCE_MAX_BYTES} from "@/lib/payments/transfer-evidence";
export const runtime="nodejs";
const noStore={"Cache-Control":"private, no-store"};
const fail=(code:string,status:number)=>NextResponse.json({ok:false,code},{status,headers:noStore});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return fail("FORBIDDEN",403);}
 const actor=await currentUserId();if(!actor)return fail("UNAUTHENTICATED",401);
 const length=Number(request.headers.get("content-length")??"0");
 if(length>TRANSFER_EVIDENCE_MAX_BYTES+16384)return fail("EVIDENCE_TOO_LARGE",413);
 let data:FormData;
 try{data=await request.formData();}catch{return fail("INVALID_INPUT",400);}
 const id=data.get("paymentRequestId"),tenantId=data.get("tenantId"),attachment=data.get("file");
 if(typeof id!=="string"||!uuid.test(id)||typeof tenantId!=="string"||!uuid.test(tenantId)||!(attachment instanceof File))return fail("INVALID_INPUT",400);
 let membership;
 try{membership=await requireTenantMembership(actor,tenantId,["owner"],false);}catch{return fail("FORBIDDEN",403);}
 if(membership.adminAccess)return fail("FORBIDDEN",403);
 if(attachment.size===0||attachment.size>TRANSFER_EVIDENCE_MAX_BYTES)return fail("EVIDENCE_TOO_LARGE",413);
 const content=new Uint8Array(await attachment.arrayBuffer());
 const mime=identifyTransferEvidence(content);
 if(!mime)return fail("UNSUPPORTED_EVIDENCE",400);
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [requests]=await db.execute<RowDataPacket[]>(
   "SELECT id FROM platform_payment_requests WHERE id=? AND tenant_id=? AND status='pending' FOR UPDATE",
   [id,tenantId]);
  if(!requests.length){await db.rollback();return fail("PAYMENT_NOT_PENDING",409);}
  await db.execute(
   "INSERT INTO platform_payment_transfer_evidence(payment_request_id,mime_type,file_size,contents) VALUES (?,?,?,?) "+
   "ON DUPLICATE KEY UPDATE mime_type=VALUES(mime_type),file_size=VALUES(file_size),contents=VALUES(contents),uploaded_at=NOW()",
   [id,mime,content.byteLength,Buffer.from(content)]);
  await db.commit();return NextResponse.json({ok:true},{headers:noStore});
 }catch{await db.rollback();return fail("EVIDENCE_SAVE_FAILED",503);}finally{db.release();}
}
