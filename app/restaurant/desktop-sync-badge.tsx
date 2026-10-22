export default function DesktopSyncBadge({state,locale}:{state?:string|null;locale:string}){
 const labels:Record<string,Record<string,string>>={
  ar:{pending:"محفوظ محلياً · بانتظار المزامنة",retrying:"محفوظ محلياً · ستُعاد محاولة المزامنة",conflict:"محفوظ محلياً · يحتاج مراجعة قبل المزامنة",synced:"تمت مزامنة الطلب مع السحابة"},
  en:{pending:"Saved locally · awaiting sync",retrying:"Saved locally · sync will retry",conflict:"Saved locally · review required before sync",synced:"Order synchronized with cloud"},
  fr:{pending:"Enregistrée localement · en attente",retrying:"Enregistrée localement · nouvelle tentative prévue",conflict:"Enregistrée localement · vérification requise",synced:"Commande synchronisée avec le cloud"}
 };
 if(!state||!labels.ar[state])return null;
 return <p className="restaurantPaymentBadge" data-status={state} role="status">{(labels[locale]??labels.ar)[state]}</p>;
}
