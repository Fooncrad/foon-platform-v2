export type SystemLocale="ar"|"en"|"fr";
export type SystemStatus="NOT_FOUND"|"SERVER_ERROR"|"BAD_GATEWAY"|"SERVICE_UNAVAILABLE"|"GATEWAY_TIMEOUT"|"MAINTENANCE";
type StatusCopy={title:string;description:string;retry:string;home:string;reference:string;status:string;support:string;};

export const systemStatusMessages:Record<SystemLocale,Record<SystemStatus,StatusCopy>>={
 ar:{
  NOT_FOUND:{title:"الصفحة غير موجودة",description:"الرابط غير صحيح أو أن الصفحة لم تعد متاحة. تحقق من الرابط أو عد إلى الرئيسية.",retry:"إعادة المحاولة",home:"الصفحة الرئيسية",reference:"رقم المرجع",status:"رمز الحالة",support:"عند التواصل مع الدعم، أرسل رقم المرجع."},
  SERVER_ERROR:{title:"تعذر إكمال الطلب",description:"حدث خطأ غير متوقع أثناء فتح الصفحة. لم يتم تأكيد تنفيذ العملية؛ تحقق من حالتها قبل إعادة إرسال أي طلب دفع أو شراء.",retry:"إعادة المحاولة",home:"الصفحة الرئيسية",reference:"رقم المرجع",status:"رمز الحالة",support:"أرسل رقم المرجع لفريق الصيانة لتحديد الخطأ."},
  BAD_GATEWAY:{title:"تعذر الاتصال بالخدمة",description:"تعذر الوصول إلى التطبيق مؤقتًا. نحاول استعادة الخدمة.",retry:"إعادة المحاولة",home:"الصفحة الرئيسية",reference:"رقم المرجع",status:"رمز الحالة",support:"أرسل رقم المرجع لفريق الصيانة."},
  SERVICE_UNAVAILABLE:{title:"الخدمة غير متاحة مؤقتًا",description:"نعمل على استعادة الخدمة. حاول مرة أخرى لاحقًا. لا تكرر دفعًا أو طلبًا حتى تتأكد من حالته.",retry:"إعادة المحاولة",home:"الصفحة الرئيسية",reference:"رقم المرجع",status:"رمز الحالة",support:"أرسل رقم المرجع لفريق الصيانة."},
  GATEWAY_TIMEOUT:{title:"استغرق الاتصال وقتًا أطول",description:"انتهت مهلة الاتصال بالخادم. قد تكون العملية اكتملت؛ تحقق من حالتها قبل تكرار الطلب أو الدفع.",retry:"إعادة المحاولة",home:"الصفحة الرئيسية",reference:"رقم المرجع",status:"رمز الحالة",support:"أرسل رقم المرجع لفريق الصيانة."},
  MAINTENANCE:{title:"نقوم بتحديث المنصة",description:"تخضع خدمات FOON وNFOOD حاليًا للصيانة والتحديث. قد يتعذر فتح بعض الصفحات مؤقتًا.",retry:"التحقق مجددًا",home:"الصفحة الرئيسية",reference:"رقم المرجع",status:"رمز الحالة",support:"شكرًا لصبرك أثناء تحديث المنصة."}
 },
 en:{
  NOT_FOUND:{title:"Page not found",description:"The link is incorrect or the page is no longer available. Check the URL or return home.",retry:"Try again",home:"Home",reference:"Reference",status:"Status code",support:"Share the reference with support if you need help."},
  SERVER_ERROR:{title:"We couldn't complete that request",description:"An unexpected error occurred. The operation may have completed; check its status before retrying a purchase or payment.",retry:"Try again",home:"Home",reference:"Reference",status:"Status code",support:"Share the reference with support to identify the error."},
  BAD_GATEWAY:{title:"Couldn't connect to the service",description:"The application is temporarily unreachable. We're working to restore access.",retry:"Try again",home:"Home",reference:"Reference",status:"Status code",support:"Share the reference with support."},
  SERVICE_UNAVAILABLE:{title:"Service temporarily unavailable",description:"We're working to restore service. Try again later. Don't retry payments or orders before checking their status.",retry:"Try again",home:"Home",reference:"Reference",status:"Status code",support:"Share the reference with support."},
  GATEWAY_TIMEOUT:{title:"Connection timed out",description:"The server took too long to respond. Your operation might have completed; check its status before retrying an order or payment.",retry:"Try again",home:"Home",reference:"Reference",status:"Status code",support:"Share the reference with support."},
  MAINTENANCE:{title:"We're updating the platform",description:"FOON and NFOOD services are undergoing maintenance. Some pages may be temporarily unavailable.",retry:"Check again",home:"Home",reference:"Reference",status:"Status code",support:"Thanks for your patience while we update the platform."}
 },
 fr:{
  NOT_FOUND:{title:"Page introuvable",description:"Le lien est incorrect ou la page n'est plus disponible. Vérifiez l'adresse ou revenez à l'accueil.",retry:"Réessayer",home:"Accueil",reference:"Référence",status:"Code d'état",support:"Communiquez la référence à l'assistance si nécessaire."},
  SERVER_ERROR:{title:"Impossible de terminer la demande",description:"Une erreur inattendue s'est produite. Vérifiez l'état de la demande avant de recommencer un achat ou un paiement.",retry:"Réessayer",home:"Accueil",reference:"Référence",status:"Code d'état",support:"Transmettez la référence à l'assistance pour identifier l'erreur."},
  BAD_GATEWAY:{title:"Service inaccessible",description:"L'application est temporairement inaccessible. Nous travaillons à son rétablissement.",retry:"Réessayer",home:"Accueil",reference:"Référence",status:"Code d'état",support:"Transmettez la référence à l'assistance."},
  SERVICE_UNAVAILABLE:{title:"Service temporairement indisponible",description:"Nous travaillons à rétablir le service. Vérifiez l'état de vos achats ou paiements avant de réessayer.",retry:"Réessayer",home:"Accueil",reference:"Référence",status:"Code d'état",support:"Transmettez la référence à l'assistance."},
  GATEWAY_TIMEOUT:{title:"Délai de connexion dépassé",description:"Le serveur a mis trop de temps à répondre. Vérifiez l'état de la demande avant de répéter une commande ou un paiement.",retry:"Réessayer",home:"Accueil",reference:"Référence",status:"Code d'état",support:"Transmettez la référence à l'assistance."},
  MAINTENANCE:{title:"Nous mettons la plateforme à jour",description:"Les services FOON et NFOOD sont en maintenance. Certaines pages peuvent être temporairement indisponibles.",retry:"Vérifier à nouveau",home:"Accueil",reference:"Référence",status:"Code d'état",support:"Merci de votre patience pendant la mise à jour."}
 }
};
export function systemLocale(value:string|null|undefined):SystemLocale{
 const short=String(value??"ar").toLowerCase().split(/[-_,;]/)[0].trim();
 return short==="en"||short==="fr"?short:"ar";
}
export function systemStatusFromHttp(status:number):SystemStatus{
 switch(status){case 404:return "NOT_FOUND";case 502:return "BAD_GATEWAY";case 503:return "SERVICE_UNAVAILABLE";case 504:return "GATEWAY_TIMEOUT";default:return "SERVER_ERROR";}
}
export function localizedSystemStatus(language:SystemLocale,status:SystemStatus){return systemStatusMessages[language][status];}
