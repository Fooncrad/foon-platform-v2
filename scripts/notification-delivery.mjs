import {createDecipheriv} from 'node:crypto';
import {createMailProvider} from './mail-provider.mjs';
import {renderQueuedEmail} from './email-templates.mjs';
export async function queuedMailProvider(db,tenantId,env=process.env,createProvider=createMailProvider){
 const [rows]=tenantId?await db.execute('SELECT mode,smtp_host,smtp_user,smtp_from,smtp_from_name,smtp_secret FROM tenant_mail_settings WHERE tenant_id=? LIMIT 1',[tenantId]):[[]];
 const settings=rows[0];
 if(!settings||settings.mode!=='custom')return createProvider(env);
 if(!/^[a-f0-9]{64}$/i.test(env.FOON_MAIL_ENCRYPTION_KEY??''))throw Error('MAIL_ENCRYPTION_KEY_NOT_CONFIGURED');
 const parts=String(settings.smtp_secret??'').split('.');if(parts.length!==3)throw Error('MAIL_SECRET_INVALID');
 const decipher=createDecipheriv('aes-256-gcm',Buffer.from(env.FOON_MAIL_ENCRYPTION_KEY,'hex'),Buffer.from(parts[0],'base64'));decipher.setAuthTag(Buffer.from(parts[1],'base64'));
 const password=Buffer.concat([decipher.update(Buffer.from(parts[2],'base64')),decipher.final()]).toString('utf8');
 return createProvider({...env,SMTP_HOST:settings.smtp_host,SMTP_USER:settings.smtp_user,SMTP_FROM:settings.smtp_from,SMTP_FROM_NAME:settings.smtp_from_name||'FOON',SMTP_PASSWORD:password});
}
/** Atomic claims and bounded leases allow multiple workers and crash recovery. */
export async function deliverNotifications(db,{providerFor=tenant=>queuedMailProvider(db,tenant),limit=20}={}){
 await db.execute("UPDATE platform_notification_outbox o JOIN password_reset_tokens r ON r.id=o.id SET o.status='failed',o.last_error='RESET_LINK_EXPIRED' WHERE o.event_key='password_reset' AND o.status IN ('pending','processing') AND (r.expires_at<=NOW() OR r.used_at IS NOT NULL)");
 await db.execute("UPDATE platform_notification_outbox o JOIN email_verification_tokens v ON v.id=o.id SET o.status='failed',o.last_error='VERIFICATION_LINK_EXPIRED' WHERE o.event_key='email_verification' AND o.status IN ('pending','processing') AND (v.expires_at<=NOW() OR v.used_at IS NOT NULL)");
 // Repair an archive status if SMTP accepted the mail but a subsequent archive update failed.
 // The outbox is authoritative, so no email is sent again during reconciliation.
 await db.execute("UPDATE restaurant_customer_invoices i JOIN platform_notification_outbox o ON o.id=i.id AND o.tenant_id=i.tenant_id AND o.event_key='order_invoice' AND o.status='sent' SET i.email_status='sent',i.email_attempts=o.attempts,i.emailed_at=o.sent_at,i.email_last_error=NULL WHERE i.email_status IN ('pending','failed')");
 const [templates]=await db.execute('SELECT template_key,subject_template,body_template FROM platform_email_templates');
 await db.execute("UPDATE platform_notification_outbox SET status='failed',last_error='DELIVERY_LEASE_EXPIRED' WHERE status='processing' AND attempts>=5 AND updated_at<DATE_SUB(NOW(),INTERVAL 15 MINUTE)");
 const [rows]=await db.execute("SELECT o.id,o.tenant_id,o.event_key,o.recipient_email,o.subject,o.body_text,o.attempts,t.name AS tenant_name,u.default_locale AS language FROM platform_notification_outbox o LEFT JOIN tenants t ON t.id=o.tenant_id LEFT JOIN users u ON u.email=o.recipient_email WHERE attempts<5 AND ((o.status='pending' AND o.next_attempt_at<=NOW()) OR (o.status='processing' AND o.updated_at<DATE_SUB(NOW(),INTERVAL 15 MINUTE))) ORDER BY o.created_at LIMIT ?",[Math.max(1,Math.min(20,limit))]);
 const result={sent:0,retried:0,failed:0};
 for(const row of rows){
  const attempt=Number(row.attempts)+1;
  const [claim]=await db.execute("UPDATE platform_notification_outbox SET status='processing',attempts=attempts+1,updated_at=NOW() WHERE id=? AND attempts=? AND ((status='pending' AND next_attempt_at<=NOW()) OR (status='processing' AND updated_at<DATE_SUB(NOW(),INTERVAL 15 MINUTE)))",[row.id,row.attempts]);
  if(!claim.affectedRows)continue;
  let provider;
  try{
   provider=await providerFor(row.tenant_id);
   await provider.send({id:row.id,to:row.recipient_email,...renderQueuedEmail(row,templates)});
   await db.execute("UPDATE platform_notification_outbox SET status='sent',sent_at=NOW(),last_error=NULL WHERE id=? AND status='processing' AND attempts=?",[row.id,attempt]);
   if(row.event_key==='order_invoice'){
    // An invoice status-sync error must NEVER retry an already accepted email.
    try{await db.execute("UPDATE restaurant_customer_invoices SET email_status='sent',email_attempts=?,emailed_at=NOW(),email_last_error=NULL WHERE id=? AND tenant_id=?",[attempt,row.id,row.tenant_id]);}
    catch{console.error('INVOICE_MAIL_STATUS_SYNC_FAILED');}
   }
   result.sent++;
  }catch(error){
   const code=String(error.code??error.message??'MAIL_DELIVERY_FAILED');
   // Store codes only: SMTP responses can contain addresses or credentials.
   const safe=/^[A-Z][A-Z0-9_]{1,99}$/.test(code)?code:'MAIL_DELIVERY_FAILED';
   await db.execute("UPDATE platform_notification_outbox SET status=?,last_error=?,next_attempt_at=DATE_ADD(NOW(),INTERVAL ? SECOND) WHERE id=? AND status='processing' AND attempts=?",[attempt>=5?'failed':'pending',safe,Math.min(3600,2**Math.min(attempt,10)*60),row.id,attempt]);if(row.event_key==='order_invoice')await db.execute("UPDATE restaurant_customer_invoices SET email_status=?,email_attempts=?,email_last_error=? WHERE id=? AND tenant_id=?",[attempt>=5?'failed':'pending',attempt,safe,row.id,row.tenant_id]);
   result[attempt>=5?'failed':'retried']++;
  }finally{provider?.close();}
 }
 return result;
}
