import {NextResponse} from "next/server";
import {currentUserId} from "@/lib/auth/session";
import {resolveWorkspace} from "@/lib/tenant/workspace";
import {database} from "@/lib/db/mysql";
import type {RowDataPacket} from "mysql2/promise";

export const dynamic="force-dynamic";
/** Read-only public account metadata; no access/refresh tokens are returned. */
export async function GET(request:Request) {
 try {
  const userId=await currentUserId();
  if(!userId)return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
  const tenant=new URL(request.url).searchParams.get("tenant")??"";
  if(!tenant)return NextResponse.json({error:"TENANT_REQUIRED"},{status:400});
  let workspace:Awaited<ReturnType<typeof resolveWorkspace>>;
  try{workspace=await resolveWorkspace(userId,tenant)}catch{return NextResponse.json({error:"FORBIDDEN"},{status:403})}
  if(!["owner","manager"].includes(workspace.role))return NextResponse.json({error:"FORBIDDEN"},{status:403});
  const [rows]=await database().execute<RowDataPacket[]>(
   "SELECT id,provider,provider_account_id,display_name,account_type,status,granted_scopes,token_expires_at,last_verified_at,created_at,updated_at FROM tenant_media_social_accounts WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100",
   [workspace.tenant_id]
  );
  return NextResponse.json({accounts:rows.map(row=>({
   id:String(row.id),provider:String(row.provider),providerAccountId:String(row.provider_account_id),
   displayName:String(row.display_name??""),accountType:String(row.account_type??""),
   status:String(row.status),scopes:String(row.granted_scopes??""),
   tokenExpiresAt:row.token_expires_at??null,lastVerifiedAt:row.last_verified_at??null,
   createdAt:row.created_at,updatedAt:row.updated_at
  }))},{headers:{"Cache-Control":"no-store"}});
 } catch {
  return NextResponse.json({error:"MEDIA_ACCOUNTS_UNAVAILABLE"},{status:503,headers:{"Cache-Control":"no-store"}});
 }
}
