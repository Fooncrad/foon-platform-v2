// Run from a trusted scheduler with DATABASE_URL and a configured mail adapter.
// No messages are marked sent without successful provider delivery.
import mysql from "mysql2/promise";
const db=await mysql.createConnection(process.env.DATABASE_URL);
try{
 const [rows]=await db.execute("SELECT id,recipient_email,subject,body_text,attempts FROM platform_notification_outbox WHERE status='pending' AND next_attempt_at<=NOW() ORDER BY created_at LIMIT 20");
 for(const row of rows){
  const [claim]=await db.execute("UPDATE platform_notification_outbox SET status='processing',attempts=attempts+1 WHERE id=? AND status='pending'",[row.id]);
  if(!claim.affectedRows)continue;
  try{
   if(!process.env.FOON_MAIL_WEBHOOK_URL||!process.env.FOON_MAIL_WEBHOOK_TOKEN)throw Error("MAIL_PROVIDER_NOT_CONFIGURED");
   const endpoint=new URL(process.env.FOON_MAIL_WEBHOOK_URL);
   if(endpoint.protocol!=="https:")throw Error("MAIL_PROVIDER_HTTPS_REQUIRED");
   const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+process.env.FOON_MAIL_WEBHOOK_TOKEN},body:JSON.stringify({to:row.recipient_email,subject:row.subject,text:row.body_text,idempotencyKey:row.id}),signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error("MAIL_PROVIDER_HTTP_"+response.status);
   await db.execute("UPDATE platform_notification_outbox SET status='sent',sent_at=NOW(),last_error=NULL WHERE id=? AND status='processing'",[row.id]);
  }catch(e){
   const attempts=Number(row.attempts)+1;
   const delay=Math.min(3600,Math.pow(2,Math.min(attempts,10))*60);
   await db.execute("UPDATE platform_notification_outbox SET status=?,last_error=?,next_attempt_at=DATE_ADD(NOW(),INTERVAL ? SECOND) WHERE id=? AND status='processing'",[attempts>=5?"failed":"pending",String(e).slice(0,500),delay,row.id]);
  }
 }
}finally{await db.end();}
