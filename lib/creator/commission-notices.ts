import {randomUUID} from "node:crypto";
import type {PoolConnection,RowDataPacket} from "mysql2/promise";
type Event="earned"|"paid"|"reversed";
/** Platform-funded referral notifications, independent of merchant SMTP credentials. */
export async function queueCommissionNotice(db:PoolConnection,commissionId:string,event:Event){
 const [rows]=await db.execute<RowDataPacket[]>(
  "SELECT c.id,c.tenant_id,c.creator_user_id,c.status,c.amount,c.currency,t.name AS tenant_name,u.email,u.email_verified_at,u.default_locale "+
  "FROM customer_creator_commissions c JOIN tenants t ON t.id=c.tenant_id "+
  "JOIN users u ON u.id=c.creator_user_id AND u.status='active' WHERE c.id=? AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=c.creator_user_id) "+
  "AND NOT EXISTS (SELECT 1 FROM platform_admins a WHERE a.user_id=c.creator_user_id) LIMIT 1",[commissionId]);
 const entry=rows[0];if(!entry||entry.status!==event)return;
 const locale=String(entry.default_locale),amount=String(entry.amount)+" "+String(entry.currency);
 const subject=locale==="en"?(event==="earned"?"Referral commission earned":event==="paid"?"Referral commission paid":"Referral commission reversed"):
  locale==="fr"?(event==="earned"?"Commission de parrainage acquise":event==="paid"?"Commission de parrainage versée":"Commission annulée"):
  event==="earned"?"تم تسجيل عمولة إحالة مستحقة":event==="paid"?"تم صرف عمولة الإحالة":"تم إلغاء عمولة الإحالة";
 const path="/customer/creator/referrals/"+encodeURIComponent(commissionId);
 const origin=String(process.env.APP_URL||process.env.NEXT_PUBLIC_SITE_URL||process.env.APP_BASE_URL||"https://nfoodz.com").replace(/\/$/,"");
 const description=locale==="en"?
  (event==="earned"?"You earned a commission; it has not yet been paid. ":event==="paid"?"Your commission payout has been confirmed. ":"This commission has been reversed. "):
  locale==="fr"?(event==="earned"?"Commission acquise mais non encore versée. ":event==="paid"?"Le versement de votre commission est confirmé. ":"Cette commission est annulée. "):
  event==="earned"?"أصبحت العمولة مستحقة ولم تُصرف بعد. ":event==="paid"?"تم تأكيد صرف العمولة. ":"تم إلغاء هذه العمولة. ";
 const message=description+(locale==="en"?"Amount: ":locale==="fr"?"Montant : ":"المبلغ: ")+amount+". "+
  (locale==="en"?"View your statement: ":locale==="fr"?"Consulter le relevé : ":"عرض كشف العمولة: ")+origin+path;
 await db.execute("INSERT INTO customer_notifications(id,user_id,tenant_id,event_key,subject,body_text,resource_id) VALUES (?,?,?,?,?,?,?)",
  [randomUUID(),entry.creator_user_id,entry.tenant_id,"creator_commission_"+event,subject,message,commissionId]);
 if(entry.email_verified_at)await db.execute(
  "INSERT INTO platform_notification_outbox(id,event_key,tenant_id,recipient_email,subject,body_text) VALUES (?,?,NULL,?,?,?)",
  [randomUUID(),"creator_commission_"+event,String(entry.email),subject,message]);
}
