// Run from a trusted scheduler with DATABASE_URL and a configured mail adapter.
// No messages are marked sent without successful provider delivery.
import mysql from "mysql2/promise";
import {createMailProvider} from "./mail-provider.mjs";
import {renderQueuedEmail} from "./email-templates.mjs";
const provider=await createMailProvider();
await provider.verify();
const db=await mysql.createConnection(process.env.DATABASE_URL);
try{
 const [templates]=await db.execute("SELECT template_key,subject_template,body_template FROM platform_email_templates");
 const [rows]=await db.execute("SELECT o.id,o.event_key,o.recipient_email,o.subject,o.body_text,o.attempts,t.name AS tenant_name FROM platform_notification_outbox o LEFT JOIN tenants t ON t.id=o.tenant_id WHERE o.status='pending' AND o.next_attempt_at<=NOW() ORDER BY o.created_at LIMIT 20");
 for(const row of rows){
  const [claim]=await db.execute("UPDATE platform_notification_outbox SET status='processing',attempts=attempts+1 WHERE id=? AND status='pending'",[row.id]);
  if(!claim.affectedRows)continue;
  try{
   await provider.send({id:row.id,to:row.recipient_email,...renderQueuedEmail(row,templates)});
   await db.execute("UPDATE platform_notification_outbox SET status='sent',sent_at=NOW(),last_error=NULL WHERE id=? AND status='processing'",[row.id]);
  }catch(e){
   const attempts=Number(row.attempts)+1;
   const delay=Math.min(3600,Math.pow(2,Math.min(attempts,10))*60);
   await db.execute("UPDATE platform_notification_outbox SET status=?,last_error=?,next_attempt_at=DATE_ADD(NOW(),INTERVAL ? SECOND) WHERE id=? AND status='processing'",[attempts>=5?"failed":"pending",String(e.code||"MAIL_DELIVERY_FAILED").slice(0,100),delay,row.id]);
  }
 }
}finally{await db.end();provider.close();}
