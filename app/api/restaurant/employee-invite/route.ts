import {NextResponse} from "next/server";
// Legacy invitation issuance is intentionally disabled: staff are provisioned
// by the owner/manager with a password and branch-scoped grants instead.
export async function POST(){
 return NextResponse.json({ok:false,code:"EMPLOYEE_INVITATIONS_DISABLED"},{status:410,headers:{"Cache-Control":"no-store"}});
}
