'use strict';
// W03: demonstration-only controls. All credentials remain in native Rust.
const demoState=document.getElementById('demo-state');
const demoFeedback=document.getElementById('demo-feedback');
const demoCreate=document.getElementById('demo-create');
const demoReload=document.getElementById('demo-reload');
const demoOrders=document.getElementById('demo-orders');
const nextStatus={new:'preparing',preparing:'ready',ready:'completed'};
const statusNames={new:'جديد',preparing:'قيد التجهيز',ready:'جاهز',completed:'مكتمل',cancelled:'ملغى'};
let demoEnabled=false;
let busy=false;
const invokeDemo=(name,args)=>window.__TAURI__?.core?.invoke?.(name,args);
const setBusy=(value)=>{
  busy=value;
  demoCreate.disabled=!demoEnabled||busy;
  demoReload.disabled=!demoEnabled||busy;
};
function message(value){demoFeedback.textContent=value;}
function makeText(tag,value,cls=''){
  const element=document.createElement(tag);
  element.textContent=value;
  if(cls)element.className=cls;
  return element;
}
async function reloadDemo(){
  if(!demoEnabled||busy)return;
  setBusy(true);
  try{
    const rows=await invokeDemo('demo_list_orders');
    if(!Array.isArray(rows))throw Error('DEMO_LIST_INVALID');
    demoOrders.replaceChildren();
    if(rows.length===0){demoOrders.append(makeText('p','لا توجد طلبات تجريبية بعد.'));return;}
    for(const order of rows){
      const card=document.createElement('div');
      card.className='demo-order';
      card.append(makeText('strong','طلب #'+String(order.id).slice(0,8)));
      card.append(makeText('span',statusNames[order.status]||'حالة غير معروفة'));
      card.append(makeText('small','أحداث معلقة: '+Number(order.pendingEvents??0)));
      const next=nextStatus[order.status];
      if(next){
        const advance=makeText('button','انتقال إلى: '+statusNames[next]);
        advance.type='button';
        advance.addEventListener('click',async()=>{
          if(busy)return;
          setBusy(true);
          try{
            await invokeDemo('demo_update_order',{id:order.id,status:next});
            message('تم تحديث حالة الطلب التجريبي.');
          }catch{message('تعذر تحديث الطلب التجريبي. تحقق من حالة محرك SQLite.');}
          finally{setBusy(false);}
          await reloadDemo();
        });
        card.append(advance);
      }
      demoOrders.append(card);
    }
  }catch{
    demoOrders.replaceChildren();
    message('تعذر قراءة الطلبات التجريبية. تحقق من خدمة SQLite المحلية.');
  }finally{setBusy(false);}
}
demoCreate.addEventListener('click',async()=>{
  if(!demoEnabled||busy)return;
  setBusy(true);
  try{
    await invokeDemo('demo_create_order');
    message('تم حفظ طلب تجريبي داخل قاعدة SQLite المؤقتة.');
  }catch{message('تعذر إنشاء الطلب. الوضع التجريبي فقط، ويجب تشغيل المحرك بمفاتيح اختبار متطابقة.');}
  finally{setBusy(false);}
  await reloadDemo();
});
demoReload.addEventListener('click',()=>void reloadDemo());
async function initializeDemo(){
  demoCreate.disabled=true;
  demoReload.disabled=true;
  try{
    const result=await invokeDemo('demo_status');
    demoEnabled=result?.enabled===true;
    if(!demoEnabled){
      demoState.textContent='الوضع التجريبي غير مفعل';
      message('يُفعَّل فقط على قاعدة SQLite مؤقتة منفصلة، وليس متاحًا لمتجر حقيقي.');
      return;
    }
    demoState.textContent='وضع W03 التجريبي مفعل';
    setBusy(false);
    await reloadDemo();
  }catch{demoEnabled=false;demoState.textContent='الوضع التجريبي غير متاح';}
}
void initializeDemo();
