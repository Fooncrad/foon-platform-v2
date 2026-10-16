import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {database} from '@/lib/db/mysql';
import {deliverNotifications} from '@/scripts/notification-delivery.mjs';
export const runtime='nodejs';
export async function POST(request:Request){
 const secret=process.env.FOON_NOTIFICATION_WORKER_TOKEN;
 const provided=request.headers.get('authorization')??'';
 const expected='Bearer '+secret;
 if(!secret||secret.length<32||Buffer.byteLength(provided)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return NextResponse.json({ok:false},{status:403});
 try{return NextResponse.json({ok:true,...await deliverNotifications(database())});}catch{return NextResponse.json({ok:false,code:'NOTIFICATION_DISPATCH_UNAVAILABLE'},{status:503});}
}
