'use strict';
const label=document.getElementById('status-label');
const details=document.getElementById('status-details');
const button=document.getElementById('refresh');
const edgeLabel=document.getElementById('edge-status-label');
const edgeDetails=document.getElementById('edge-status-details');
const edgePending=document.getElementById('edge-pending');
const edgePendingCount=document.getElementById('edge-pending-count');

async function refresh(){
  button.disabled=true;
  label.textContent='جارٍ الفحص';
  edgeLabel.textContent='جارٍ التحقق';
  edgePending.hidden=true;
  try{
    const invoke=window.__TAURI__?.core?.invoke;
    if(typeof invoke!=='function')throw Error('NATIVE_SHELL_UNAVAILABLE');
    const [consoleState,gateway]=await Promise.all([invoke('station_status'),invoke('gateway_status')]);
    if(consoleState?.localConsoleListener){
      label.textContent='منفذ محلي متاح — غير موثَّق';
      details.textContent='تستمع خدمة على المنفذ 8788؛ لم تُتحقق هويتها أو صحة مزامنتها.';
    }else{
      label.textContent='واجهة Edge المحلية غير مشغّلة';
      details.textContent='لم نجد مستمعًا محليًا على 8788. تهيئة FOON Edge والتشغيل التلقائي لم تُستكمل.';
    }
    switch(gateway?.status){
      case 'authenticated':
        edgeLabel.textContent='SQLite · استجابة موثقة بالمفتاح المحلي';
        edgeDetails.textContent='نجح فحص الخدمة المحلية بمفتاح الاتصال من داخل التطبيق الأصلي. لا يعني ذلك اكتمال ربط الجهاز أو المزامنة السحابية.';
        if(Number.isSafeInteger(gateway.pending)&&gateway.pending>=0){
          edgePendingCount.textContent=String(gateway.pending);
          edgePending.hidden=false;
        }
        break;
      case 'not_configured':
        edgeLabel.textContent='محرك الطلبات غير مهيأ';
        edgeDetails.textContent='يحتاج تشغيل FOON Edge إلى إعداد محلي آمن على جهاز موثوق. لم تُطلب أو تُعرض بيانات الدخول.';
        break;
      case 'unauthorized':
        edgeLabel.textContent='فشل التحقق من المفتاح المحلي';
        edgeDetails.textContent='الخدمة رفضت مفتاح اتصال التطبيق. لا ترسل المفاتيح في المحادثة أو تضفها إلى الواجهة.';
        break;
      case 'not_running':
        edgeLabel.textContent='محرك SQLite غير مشغّل';
        edgeDetails.textContent='لم يستجب المحرك المحلي على 8787. لم نحاول تشغيل خدمة أو تعديل بيانات.';
        break;
      default:
        edgeLabel.textContent='تعذر التحقق من SQLite';
        edgeDetails.textContent='لم نحصل على استجابة صحيحة من خدمة FOON Edge المحلية.';
    }
  }catch{
    label.textContent='فحص غير متاح';
    details.textContent='لا يمكن إجراء فحص الخدمة خارج نافذة FOON Desktop الأصلية.';
    edgeLabel.textContent='فحص غير متاح';
    edgeDetails.textContent='تعذر إجراء الفحص من التطبيق الأصلي. لم تتغير بيانات الطلبات.';
  }finally{button.disabled=false;}
}
button.addEventListener('click',refresh);
window.refreshFoonStation=refresh;
void refresh();
if(typeof setInterval==='function')setInterval(()=>{
  if(!document.hidden&&!button.disabled)void refresh();
},8000);
