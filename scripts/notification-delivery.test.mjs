import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv} from 'node:crypto';
import {deliverNotifications,queuedMailProvider} from './notification-delivery.mjs';
import {notificationCopy} from './customer-notification-copy.mjs';
import {renderQueuedEmail} from './email-templates.mjs';
function fixture({attempts=0,claimed=true}={}){const calls=[];return {calls,db:{async execute(sql,args){calls.push({sql,args});if(sql.startsWith('SELECT template_key'))return [[]];if(sql.startsWith('SELECT o.id'))return [[{id:'job',tenant_id:'store-a',event_key:'order_ready',recipient_email:'customer@test.example',subject:'Ready',body_text:'Ready',attempts,language:'en'}]];return [{affectedRows:claimed?1:0}];}}};}
test('delivery claims once, uses the store provider and marks sent only after acceptance',async()=>{const f=fixture(),sent=[];const result=await deliverNotifications(f.db,{providerFor:async tenant=>{assert.equal(tenant,'store-a');return {send:async mail=>{assert.equal(f.calls.some(c=>c.sql.startsWith("UPDATE platform_notification_outbox SET status='sent'")),false);sent.push(mail);},close(){}}}});assert.equal(result.sent,1);assert.equal(sent[0].id,'job');assert.ok(f.calls.some(c=>c.sql.startsWith("UPDATE platform_notification_outbox SET status='sent'")&&c.args[1]===1));});
test('lost claim cannot send another worker’s message',async()=>{const f=fixture({claimed:false});const result=await deliverNotifications(f.db,{providerFor:async()=>{throw Error('MUST_NOT_SEND')}});assert.equal(result.sent,0);assert.equal(f.calls.some(c=>c.sql.startsWith("UPDATE platform_notification_outbox SET status='sent'")),false);});
test('SMTP failure retries without leaking provider responses or marking success',async()=>{const f=fixture();const result=await deliverNotifications(f.db,{providerFor:async()=>{throw Error('password=private customer@test.example')}});assert.equal(result.retried,1);const retry=f.calls.find(c=>c.sql.startsWith('UPDATE platform_notification_outbox SET status=?'));assert.equal(retry.args[0],'pending');assert.equal(retry.args[1],'MAIL_DELIVERY_FAILED');assert.equal(retry.args[2],120);assert.equal(f.calls.some(c=>c.sql.startsWith("UPDATE platform_notification_outbox SET status='sent'")),false);});
test('fifth failure is terminal and stale claims have a bounded recovery lease',async()=>{const f=fixture({attempts:4});const result=await deliverNotifications(f.db,{providerFor:async()=>{throw Error('MAIL_PROVIDER_NOT_CONFIGURED')}});assert.equal(result.failed,1);assert.ok(f.calls.some(c=>c.sql.includes('INTERVAL 15 MINUTE')));assert.equal(f.calls.find(c=>c.sql.startsWith('UPDATE platform_notification_outbox SET status=?')).args[0],'failed');});
test('English and French transactional messages have no Arabic interface fallback',()=>{for(const language of ['en','fr'])for(const event of ['account_welcome','order_new','order_ready','order_payment_paid','reservation_confirmed']){const copy=notificationCopy(language,event,{store:'Store',reference:'123',status:'ready'});assert.equal(/[\u0600-\u06ff]/.test(copy.subject+copy.text),false);const rendered=renderQueuedEmail({event_key:event,subject:copy.subject,body_text:copy.text,tenant_name:'Store',language});assert.equal(/[\u0600-\u06ff]/.test(rendered.html),false);assert.ok(rendered.html.includes('lang="'+language+'" dir="ltr"'));}});

test('custom tenant SMTP is decrypted only for its own provider and never falls back on a bad key',async()=>{
 const key=Buffer.alloc(32,1),iv=Buffer.alloc(12,2),cipher=createCipheriv('aes-256-gcm',key,iv),encrypted=Buffer.concat([cipher.update('tenant-test-password','utf8'),cipher.final()]);
 const secret=[iv,cipher.getAuthTag(),encrypted].map(b=>b.toString('base64')).join('.');
 const db={async execute(sql,args){assert.equal(args[0],'tenant-only');return [[{mode:'custom',smtp_host:'smtp.example.test',smtp_user:'store@example.test',smtp_from:'store@example.test',smtp_from_name:'Store',smtp_secret:secret}]];}};
 const env={SMTP_PASSWORD:'platform-test-password',FOON_MAIL_ENCRYPTION_KEY:key.toString('hex')};
 const received=await queuedMailProvider(db,'tenant-only',env,async options=>options);assert.equal(received.SMTP_PASSWORD,'tenant-test-password');assert.equal(received.SMTP_USER,'store@example.test');
 await assert.rejects(()=>queuedMailProvider(db,'tenant-only',{...env,FOON_MAIL_ENCRYPTION_KEY:Buffer.alloc(32,3).toString('hex')},async()=>{throw Error('MUST_NOT_FALL_BACK')}));
});

test('notification worker skips expired and already-used verification links',async()=>{
 const f=fixture({claimed:false});
 await deliverNotifications(f.db,{providerFor:async()=>({send(){throw Error("NOT_SENT")},close(){}})});
 assert.ok(f.calls.some(c=>c.sql.includes("JOIN email_verification_tokens v")&&c.sql.includes("VERIFICATION_LINK_EXPIRED")));
});

test('invoice delivery marks archive sent only after SMTP accepts, and never re-sends on status-sync failure',async()=>{
 const calls=[];let delivered=0;
 const db={async execute(sql,args){
  calls.push({sql,args});
  if(sql.startsWith('SELECT template_key'))return [[]];
  if(sql.startsWith('SELECT o.id'))return [[{id:'invoice-uuid',tenant_id:'store-a',event_key:'order_invoice',recipient_email:'customer@test.example',subject:'Order receipt',body_text:'Paid',attempts:0,language:'en'}]];
  if(sql.startsWith('UPDATE restaurant_customer_invoices SET email_status='))throw Error('ARCHIVE_TEMPORARILY_UNAVAILABLE');
  return [{affectedRows:1}];
 }};
 const result=await deliverNotifications(db,{providerFor:async()=>({send:async()=>{delivered++;},close(){}})});
 assert.equal(delivered,1);
 assert.equal(result.sent,1);
 assert.equal(result.retried,0);
 assert.ok(calls.some(x=>x.sql.includes("platform_notification_outbox SET status='sent'")));
 assert.ok(calls.some(x=>x.sql.includes("o.status='sent'")&&x.sql.includes("UPDATE restaurant_customer_invoices i")));
 assert.equal(calls.some(x=>x.sql.includes('platform_notification_outbox SET status=?')),false);
});
