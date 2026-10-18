'use strict';
// W04 owns the isolated demo process through Rust, never the browser.
const startButton=document.getElementById('w04-start');
const stopButton=document.getElementById('w04-stop');
const runtimeStatus=document.getElementById('w04-status');
const runtimeFeedback=document.getElementById('w04-feedback');
let runtimeBusy=false;
let runtimeRunning=false;
let otherModeRunning=false;
const nativeInvoke=(name)=>window.__TAURI__?.core?.invoke?.(name);
function renderRuntime(){
  startButton.disabled=runtimeBusy||runtimeRunning||otherModeRunning;
  stopButton.disabled=runtimeBusy||!runtimeRunning;
  runtimeStatus.textContent=otherModeRunning?'محرك W05 المحفوظ يعمل':runtimeRunning?'محرك W04 التجريبي يعمل':'المحرك التجريبي متوقف';
}
async function reloadRuntime(){
  if(runtimeBusy)return;
  try{
    const result=await nativeInvoke('launcher_status');
    runtimeRunning=result?.running===true&&result?.mode!=='durable';
    otherModeRunning=result?.running===true&&result?.mode==='durable';
    renderRuntime();
  }catch{
    runtimeRunning=false;
    startButton.disabled=true;
    stopButton.disabled=true;
    runtimeStatus.textContent='مشغل W04 غير متاح';
  }
}
startButton.addEventListener('click',async()=>{
  if(runtimeRunning||runtimeBusy)return;
  runtimeBusy=true;
  renderRuntime();
  runtimeFeedback.textContent='جارٍ بدء محرك SQLite التجريبي...';
  try{
    const result=await nativeInvoke('start_demo_runtime');
    if(result?.running!==true)throw Error('NATIVE_LAUNCH_FAILED');
    runtimeRunning=true;
    runtimeFeedback.textContent='بدأ المحرك المملوك للتطبيق. يمكنك إنشاء طلب وهمي الآن.';
    await window.refreshFoonDemo?.();
    await window.refreshFoonStation?.();
  }catch{
    runtimeFeedback.textContent='تعذر البدء. تحقق من توفر المنفذ 8787 وتجهيز موارد Node 24 المضمنة. لا توقف أي عملية أخرى.';
  }finally{
    runtimeBusy=false;
    await reloadRuntime();
  }
});
stopButton.addEventListener('click',async()=>{
  if(!runtimeRunning||runtimeBusy)return;
  runtimeBusy=true;
  renderRuntime();
  try{
    await nativeInvoke('stop_demo_runtime');
    runtimeRunning=false;
    runtimeFeedback.textContent='تم إنهاء محرك التجربة وتنظيف ملفاته المؤقتة.';
    await window.refreshFoonDemo?.();
    await window.refreshFoonStation?.();
  }catch{
    runtimeFeedback.textContent='تعذر إيقاف التجربة. أغلق البرنامج لطلب إنهاء محركه المملوك.';
  }finally{
    runtimeBusy=false;
    await reloadRuntime();
  }
});
window.refreshFoonLauncher=reloadRuntime;
void reloadRuntime();
// Low-frequency read-only refresh; no cloud network calls from the frontend.
if(typeof setInterval==='function'){
  setInterval(()=>{
    if(document.hidden||runtimeBusy)return;
    void reloadRuntime();
  },8000);
}
