'use strict';
const label=document.getElementById('status-label');
const details=document.getElementById('status-details');
const button=document.getElementById('refresh');
async function refresh(){
  button.disabled=true;
  label.textContent='جارٍ الفحص';
  try{
    const invoke=window.__TAURI__?.core?.invoke;
    if(typeof invoke!=='function')throw Error('NATIVE_SHELL_UNAVAILABLE');
    const result=await invoke('station_status');
    if(result?.localConsoleListener){
      label.textContent='منفذ محلي متاح — غير موثَّق';
      details.textContent='هناك خدمة تستمع محليًا على المنفذ 8788. لم نتحقق بعد من هويتها أو صحة ربط FOON Edge؛ لا يعتبر هذا نجاح اتصال أو مزامنة.';
    }else{
      label.textContent='الخدمة المحلية غير مشغّلة';
      details.textContent='لم نجد مستمعًا محليًا على 8788. تثبيت وإدارة خدمة FOON Edge سيدخلان في دفعة لاحقة.';
    }
  }catch{
    label.textContent='فحص غير متاح';
    details.textContent='لا يمكن إجراء فحص الخدمة خارج نافذة FOON Desktop الأصلية.';
  }finally{button.disabled=false;}
}
button.addEventListener('click',refresh);
void refresh();
