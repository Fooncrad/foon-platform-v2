'use strict';
// No SQLite filename, keys or network operations are exposed to the webview.
const recoveryButton=document.getElementById('w06-inspect');
const recoveryStatus=document.getElementById('w06-status');
const recoveryFeedback=document.getElementById('w06-feedback');
let recoveryBusy=false;
recoveryButton.addEventListener('click',async()=>{
  if(recoveryBusy)return;
  recoveryBusy=true;recoveryButton.disabled=true;
  recoveryStatus.textContent='جارٍ فحص SQLite محليًا...';
  recoveryFeedback.textContent='يجب أن يكون محرك W05 متوقفًا لإجراء هذا الفحص.';
  try{
    const report=await window.__TAURI__?.core?.invoke?.('inspect_durable_sqlite');
    if(report?.healthy!==true||![report.orders,report.events,report.pending]
       .every(x=>Number.isSafeInteger(x)&&x>=0))throw Error('INSPECT_INVALID');
    recoveryStatus.textContent='SQLite سليمة وفق اختبار سلامة الملفات';
    recoveryFeedback.textContent='الطلبات المحفوظة: '+report.orders+
      ' · الأحداث المسجلة: '+report.events+
      ' · أحداث Outbox المعلقة: '+report.pending+
      ' — هذا ليس اختبار مزامنة سحابية.';
  }catch{
    recoveryStatus.textContent='تعذر إكمال فحص W06';
    recoveryFeedback.textContent='أوقف محرك W05 أولًا ثم حاول. قد تكون القاعدة غير متاحة أو هناك مشكلة سلامة؛ لم تُحذف أي بيانات.';
  }finally{
    recoveryBusy=false;recoveryButton.disabled=false;
  }
});
