'use strict';
// W05 synthetic test: no credentials or database paths in the webview.
const w05Start=document.getElementById('w05-start');
const w05Stop=document.getElementById('w05-stop');
const w05Status=document.getElementById('w05-status');
const w05Feedback=document.getElementById('w05-feedback');
const w05Invoke=name=>window.__TAURI__?.core?.invoke?.(name);
let w05Busy=false;
let w05Mode='none';
function drawW05(){
  w05Start.disabled=w05Busy||w05Mode!=='none';
  w05Stop.disabled=w05Busy||w05Mode!=='durable';
  w05Status.textContent=w05Mode==='durable'?'محرك W05 المحفوظ يعمل':
    w05Mode==='temporary'?'محرك W04 المؤقت يعمل':'اختبار W05 متوقف والبيانات محفوظة';
}
async function checkW05(){
  if(w05Busy)return;
  try{
    const state=await w05Invoke('launcher_status');
    w05Mode=state?.running===true?String(state.mode||'temporary'):'none';
    drawW05();
  }catch{
    w05Start.disabled=true;
    w05Stop.disabled=true;
    w05Status.textContent='تعذر التحقق من محرك W05';
  }
}
async function updateAfterW05(){
  await window.refreshFoonDemo?.();
  await window.refreshFoonStation?.();
  await window.refreshFoonLauncher?.();
}
w05Start.addEventListener('click',async()=>{
  if(w05Busy||w05Mode!=='none')return;
  w05Busy=true;drawW05();
  w05Feedback.textContent='جارٍ تشغيل SQLite وفتح قاعدة اختبار W05 المحفوظة...';
  try{
    const result=await w05Invoke('start_durable_test_runtime');
    if(result?.running!==true||result?.mode!=='durable')throw Error('W05_START_UNCONFIRMED');
    w05Mode='durable';
    w05Feedback.textContent='تم تشغيل W05. أضف طلبًا وهميًا أو راجع الطلبات السابقة. هذه البيانات محفوظة بعد إغلاق البرنامج.';
    await updateAfterW05();
  }catch{
    w05Feedback.textContent='تعذر بدء W05. تأكد من إيقاف W04، وخلو المنفذ 8787، وعدم وجود تعارض في قاعدة الاختبار. لم تُحذف البيانات.';
  }finally{
    w05Busy=false;
    await checkW05();
  }
});
w05Stop.addEventListener('click',async()=>{
  if(w05Busy||w05Mode!=='durable')return;
  w05Busy=true;drawW05();
  try{
    const result=await w05Invoke('stop_durable_test_runtime');
    if(result?.running!==false)throw Error('W05_STOP_UNCONFIRMED');
    w05Mode='none';
    w05Feedback.textContent='توقف المحرك مع الاحتفاظ بالطلبات والأحداث في SQLite. اضغط تشغيل W05 لاستعادتها.';
    await updateAfterW05();
  }catch{
    w05Feedback.textContent='تعذر إيقاف W05. لا تحذف أي ملفات يدويًا؛ أغلق التطبيق بعد حفظ ما تحتاجه.';
  }finally{
    w05Busy=false;
    await checkW05();
  }
});
void checkW05();
if(typeof setInterval==='function')setInterval(()=>{
  if(!document.hidden&&!w05Busy)void checkW05();
},8000);
