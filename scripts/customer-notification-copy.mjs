export function notificationCopy(language,event,{store='',reference='',status=''}={}){
 const index=language==='en'?1:language==='fr'?2:0;
 const pick=values=>values[index];
 const statuses={pending:['بانتظار التأكيد','Awaiting confirmation','En attente de confirmation'],new:['جديد','New','Nouveau'],preparing:['قيد التحضير','Preparing','En préparation'],ready:['جاهز','Ready','Prêt'],completed:['مكتمل','Completed','Terminé'],cancelled:['ملغي','Cancelled','Annulé'],no_show:['لم يحضر','No-show','Absent'],paid:['مدفوع','Paid','Payé'],refunded:['تم رد المبلغ','Refunded','Remboursé'],confirmed:['مؤكد','Confirmed','Confirmé'],seated:['تم تسجيل الحضور','Checked in','Arrivée enregistrée']};
 const value=pick(statuses[status]??['قيد المتابعة','In progress','En cours']);
 if(event==='subscription_renewal')return {subject:pick(['تأكيد تجديد الاشتراك — FOON','Subscription renewal confirmed — FOON','Renouvellement confirmé — FOON']),text:pick(['تم اعتماد الدفع وتجديد الاشتراك. مرجع الطلب: ','Payment approved and subscription renewed. Reference: ','Paiement approuvé et abonnement renouvelé. Référence : '])+reference};
 if(event==='account_welcome')return {subject:pick(['مرحبًا بك في FOON','Welcome to FOON','Bienvenue sur FOON']),text:pick(['تم إنشاء حسابك. يمكنك متابعة طلباتك من حساب العميل.','Your account is ready. Track your orders in your customer account.','Votre compte est prêt. Suivez vos commandes dans votre espace client.'])};
 const reservation=event.startsWith('reservation_');
 const subject=pick(reservation?['تحديث حجزك','Reservation update','Mise à jour de réservation']:['تحديث طلبك','Order update','Mise à jour de commande'])+' #'+reference+' — '+store;
 const text=pick(reservation?['حالة الحجز: ','Reservation status: ','État de la réservation : ']:['حالة الطلب أو الدفع: ','Order / payment status: ','État de commande / paiement : '])+value+'\n'+store+'\n#'+reference+'\n'+pick(['راجع التفاصيل من حسابك في FOON.','View details in your FOON account.','Consultez les détails dans votre compte FOON.']);
 return {subject,text};
}
