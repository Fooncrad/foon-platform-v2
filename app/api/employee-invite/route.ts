import {NextResponse} from "next/server";
// Revoke the former email-token onboarding route. Legacy links cannot grant access.
export async function POST(){
 return NextResponse.json({ok:false,code:"EMPLOYEE_INVITATIONS_DISABLED"},{status:410,headers:{"Cache-Control":"no-store"}});
}
