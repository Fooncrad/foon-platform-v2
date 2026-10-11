"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {operationApi} from "./resource-manager";
import {MerchantIcon} from "./merchant-icon";
import {printLocales,resolvePrintLocale} from "@/lib/restaurant/print-locales";
import type {MenuGroup} from "@/lib/restaurant/menu";
import MenuChoices,{cartKey,choicePrice,choicesValid,type CartLine} from "./menu-choices";
type Order={id:string;order_number:number;branch_id:string;status:string;payment_status:string;total:number|null;version:number;channel:string;table_id?:string|null;currency?:string|null;dining_section_id:string|null;party_size:number|null;dining_snapshot:{name:string;sectionName:string}|null;customer_name:string|null;created_at:string;items:{name:string;quantity:number}[]};
const statuses:Record<string,string>={new:"جديد",preparing:"قيد التحضير",ready:"جاهز",completed:"مكتمل",cancelled:"ملغي"};
const channels:Record<string,string>={dine_in:"داخل المطعم",takeaway:"سفري",delivery:"توصيل",pickup:"نقطة استلام",room_service:"خدمة الغرف",hotel_service:"خدمة الفندق",reservation:"حجز مع طلب",preorder:"طلب مسبق"};
const payments:Record<string,string>={paid:"مدفوع",unpaid:"غير مدفوع",refunded:"تم رد المبلغ"};
export default function OrderWorkspace({tenantId,module,branch,branches,role,onChanged}:{tenantId:string;module:string;branch:string;branches:{id:string;name:string}[];role:string;onChanged:()=>void}){
 const locale=resolvePrintLocale(typeof document==="undefined"?"ar":document.documentElement.lang);
 const labels=printLocales[locale];
 const [orders,setOrders]=useState<Order[]>([]),[menu,setMenu]=useState<{id:string;name:string;status:string;data:{price:number}}[]>([]),[tables,setTables]=useState<{id:string;name:string;status:string;data:{capacity:number;sectionId?:string}}[]>([]),[cart,setCart]=useState<Record<string,CartLine>>({}),[filter,setFilter]=useState("all"),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[orderBranch,setOrderBranch]=useState(branch||branches[0]?.id||"");
 const [options,setOptions]=useState<Record<string,MenuGroup[]>>({});
 const [channel,setChannel]=useState("takeaway"),[table,setTable]=useState("");
 const scope=module==="pos"?orderBranch:branch;
 const requestRef=useRef<{payload:string;key:string}|null>(null);
 const [selectedOptions,setSelectedOptions]=useState<Record<string,string[]>>({});
 async function refresh(){const data=await operationApi(tenantId,module,"GET",undefined,scope);setOrders(data.orders);setMenu(data.menu??[]);setTables(data.tables??[]);setOptions(data.options??{});}
 useEffect(()=>{let alive=true;const load=()=>operationApi(tenantId,module,"GET",undefined,scope).then(data=>{if(alive){setOrders(data.orders);setMenu(data.menu??[]);setTables(data.tables??[]);setOptions(data.options??{});setLoading(false);}}).catch(error=>{if(alive){setLoading(false);setMessage(String(error.message));}});void load();const timer=setInterval(()=>void load(),15000);return()=>{alive=false;clearInterval(timer);};},[tenantId,module,scope]);
 async function update(order:Order,change:{status?:string;paymentStatus?:string}){if(updatingIds.has(order.id))return;setUpdatingIds(ids=>new Set(ids).add(order.id));try{await operationApi(tenantId,module,"PATCH",{id:order.id,version:order.version,...change});await refresh();setMessage("تم تحديث الطلب.");}catch(error){setMessage(error instanceof Error?error.message:"تعذر التحديث.");}finally{setUpdatingIds(ids=>{const next=new Set(ids);next.delete(order.id);return next;});}}
 async function create(event:FormEvent<HTMLFormElement>){event.preventDefault();if(busy)return;const f=new FormData(event.currentTarget);setBusy(true);try{const payload={branchId:f.get("branchId"),channel:f.get("channel"),tableId:channel==="dine_in"?f.get("tableId")||null:null,partySize:channel==="dine_in"?Number(f.get("partySize")):null,customerName:f.get("customerName"),customerPhone:f.get("customerPhone"),couponCode:f.get("couponCode")||null,items:Object.values(cart).filter(line=>line.quantity>0).map(line=>({id:line.itemId,quantity:line.quantity,options:line.options}))};const encoded=JSON.stringify(payload);if(requestRef.current?.payload!==encoded)requestRef.current={payload:encoded,key:crypto.randomUUID()};await operationApi(tenantId,"pos","POST",{...payload,requestKey:requestRef.current.key});requestRef.current=null;setCart({});await refresh();onChanged();setMessage("تم إنشاء الطلب. الأسعار والإجمالي حُسبت من المنيو المحفوظ.");}catch(error){setMessage(error instanceof Error?error.message:"تعذر إنشاء الطلب.");}finally{setBusy(false);}}
 function printOrder(order:Order,finalInvoice=false){
  const popup=window.open("","_blank","width=440,height=720");
  if(!popup){setMessage("اسمح بالنوافذ المنبثقة لطباعة الطلب.");return;}
  const doc=popup.document;
  const locale=resolvePrintLocale(document.documentElement.lang);
  const t=printLocales[locale];
  doc.documentElement.lang=locale;
  doc.documentElement.dir=locale==="ar"?"rtl":"ltr";
  const el=(tag:string,value:string,className?:string)=>{
   const node=doc.createElement(tag);node.textContent=value;
   if(className)node.className=className;
   doc.body.appendChild(node);return node;
  };
  doc.title=(finalInvoice?t.receipt:t.ticket)+" #"+order.order_number;
  const style=doc.createElement("style");
  style.textContent=`@page{size:80mm auto;margin:3mm}*{box-sizing:border-box}body{direction:inherit;color:#111;font:12px Arial,Tahoma,sans-serif;width:74mm;margin:0 auto}h1{text-align:center;font-size:21px;margin:8px 0 2px}h2{text-align:center;font-size:15px;margin:4px 0 12px}.hero{font-size:18px;font-weight:800;text-align:center;border:2px solid #111;padding:9px;margin:8px 0}.line{display:flex;justify-content:space-between;gap:8px;padding:7px 0;border-bottom:1px dashed #bbb}.line span:first-child{flex:1}.line strong{text-align:left;white-space:nowrap}.total{font-size:17px;font-weight:800;border-top:2px solid #111;margin-top:10px}.note{text-align:center;font-size:10px;margin:12px 0;line-height:1.6}.controls{margin:18px auto;text-align:center}@media print{.controls{display:none}}`;
  doc.head.appendChild(style);
  el("h1","FOON");
  el("h2",finalInvoice?t.receipt:t.ticket);
  const type=(t as Record<string,string>)[order.channel]??order.channel;
  const location=order.channel==="dine_in"?" — "+t.table+" "+(order.dining_snapshot?.name??order.table_id??t.unknownTable):"";
  el("div",type+location,"hero");
  const line=(label:string,value:string,cls?:string)=>{
   const row=doc.createElement("div");row.className="line"+(cls?" "+cls:"");
   const left=doc.createElement("span");left.textContent=label;
   const right=doc.createElement("strong");right.textContent=value;
   row.append(left,right);doc.body.appendChild(row);
  };
  line(t.orderNumber,"#"+order.order_number);
  line(t.orderStatus,(t as Record<string,string>)[order.status]??order.status);
  line(t.payment,(t as Record<string,string>)[order.payment_status]??order.payment_status);
  line(t.date,new Date(order.created_at).toLocaleString(locale+"-u-nu-latn"));
  if(order.dining_snapshot?.sectionName)line(t.section,order.dining_snapshot.sectionName);
  if(order.party_size)line(t.guests,String(order.party_size));
  if(finalInvoice&&order.customer_name)line(t.customer,order.customer_name);
  el("h2",t.items);
  for(const item of order.items)line(item.name,"× "+item.quantity);
  if(finalInvoice)line(t.paidAmount,Number(order.total??0).toFixed(2)+" "+(order.currency??"SAR"),"total");
  el("div",finalInvoice?t.notTaxInvoice:t.kitchenNote,"note");
  const controls=doc.createElement("div");controls.className="controls";
  const button=doc.createElement("button");button.textContent=t.print;button.onclick=()=>popup.print();
  controls.appendChild(button);doc.body.appendChild(controls);
  popup.focus();popup.setTimeout(()=>popup.print(),300);
 }
 function actions(order:Order){
  const next:Record<string,string>={new:"preparing",preparing:"ready",ready:"completed"};
  const canAdvance=["owner","manager","cashier"].includes(role)||role==="kitchen"&&["new","preparing"].includes(order.status)||["waiter","driver"].includes(role)&&order.status==="ready";
  return <div className="restaurantOrderActions">{canAdvance&&next[order.status]&&<button className="restaurantOrderAdvance" disabled={updatingIds.has(order.id)} onClick={()=>void update(order,{status:next[order.status]})}>نقل إلى {statuses[next[order.status]]}</button>}{["owner","manager","cashier"].includes(role)&&order.status!=="cancelled"&&<>{order.payment_status==="unpaid"?<button disabled={updatingIds.has(order.id)} onClick={()=>void update(order,{paymentStatus:"paid"})}>تسجيل دفع يدوي</button>:order.payment_status==="paid"?<button className="restaurantOrderRefund" disabled={updatingIds.has(order.id)} onClick={()=>void update(order,{paymentStatus:"refunded"})}>تسجيل رد المبلغ</button>:null}{["new","preparing","ready"].includes(order.status)&&order.payment_status!=="paid"&&<button className="restaurantOrderCancel" disabled={updatingIds.has(order.id)} onClick={()=>void update(order,{status:"cancelled"})}>إلغاء الطلب</button>}</>}<button type="button" onClick={()=>printOrder(order)}>{labels.print} · {labels.ticket}</button>{order.payment_status==="paid"&&<button type="button" onClick={()=>printOrder(order,true)}>{labels.print} · {labels.receipt}</button>}</div>;
 }
 const [updatingIds,setUpdatingIds]=useState<Set<string>>(()=>new Set());
 useEffect(()=>{if(!message)return;const timer=window.setTimeout(()=>setMessage(""),4500);return()=>window.clearTimeout(timer);},[message]);
 const [sectionFilter,setSectionFilter]=useState("");
 const selected=orders.filter(o=>(filter==="all"||o.status===filter)&&(!sectionFilter||o.dining_section_id===sectionFilter)),sum=Object.values(cart).reduce((total,line)=>total+line.quantity*(Number(menu.find(item=>item.id===line.itemId)?.data.price??0)+choicePrice(options[line.itemId]??[],line.options)),0);
 return <section className="restaurantPanel"><header><div><h3>{module==="pos"?"نقطة البيع":module==="kds"?"شاشة المطبخ":"إدارة الطلبات"}</h3><p>طلبات المطعم من قاعدة البيانات · تحديث تلقائي كل 15 ثانية</p></div><MerchantIcon name={module==="kds"?"chef":"bag"}/></header>{message&&<div className="restaurantActionToast" role="status" aria-live="polite"><span>{message}</span><button type="button" aria-label="إغلاق الإشعار" onClick={()=>setMessage("")}>×</button></div>}
 {module==="pos"&&<form className="restaurantPos" onSubmit={create}><div><h3>الأصناف المتاحة</h3><div className="restaurantPosMenu">{menu.filter(item=>item.status==="active"&&Number(item.data.price)>=0).map(item=><article key={item.id}><b>{item.name}</b><span>{Number(item.data.price).toFixed(2)} ر.س</span><MenuChoices groups={options[item.id]??[]} selected={selectedOptions[item.id]??[]} onChange={ids=>setSelectedOptions(values=>({...values,[item.id]:ids}))}/><button type="button" disabled={!choicesValid(options[item.id]??[],selectedOptions[item.id]??[])} onClick={()=>{const selected=selectedOptions[item.id]??[],key=cartKey(item.id,selected);setCart(v=>({...v,[key]:{itemId:item.id,options:selected,quantity:(v[key]?.quantity??0)+1}}));}}>إضافة إلى الطلب +</button></article>)}</div>{!menu.length&&<p className="restaurantEmptyMessage">أضف أصناف المنيو أولاً لتبدأ البيع.</p>}</div><div className="restaurantResourceForm"><label>الفرع<select name="branchId" required value={orderBranch} onChange={e=>{setOrderBranch(e.target.value);setTable("");setCart({});}}>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>نوع الطلب<select name="channel" value={channel} onChange={e=>setChannel(e.target.value)}><option value="dine_in">داخل المطعم</option><option value="takeaway">سفري</option><option value="delivery">توصيل</option></select></label>{channel==="dine_in"&&<><label>الطاولة<select name="tableId" required value={table} onChange={e=>setTable(e.target.value)}><option value="">اختر طاولة مضافة</option>{tables.filter(t=>t.status!=="inactive").map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>عدد الأشخاص<input name="partySize" type="number" required min={1} max={tables.find(t=>t.id===table)?.data.capacity??100} defaultValue={1}/></label></>}<label>اسم العميل<input name="customerName" maxLength={180}/></label><label>هاتف العميل<input name="customerPhone" maxLength={40}/></label><label>كود الخصم<input name="couponCode" maxLength={40}/></label><div className="restaurantCart">{Object.entries(cart).filter(([,line])=>line.quantity>0).map(([key,line])=><label key={key}>{menu.find(i=>i.id===line.itemId)?.name}{line.options.length>0&&<small>{(options[line.itemId]??[]).flatMap(g=>g.values).filter(v=>line.options.includes(v.id)).map(v=>v.name).join("، ")}</small>}<input type="number" value={line.quantity} min={0} max={1000} onChange={e=>setCart(v=>({...v,[key]:{...line,quantity:Number(e.target.value)}}))}/></label>)}<strong>الإجمالي قبل الخصم: {sum.toFixed(2)} ر.س</strong></div><button className="restaurantPrimary" disabled={busy||!Object.values(cart).some(line=>line.quantity>0)}>{busy?"جارٍ الحفظ…":"إنشاء الطلب"}</button><p className="restaurantFinePrint">تسجيل الدفع أو رده هنا يوثّق الدفع اليدوي؛ لا ينفّذ عملية على بوابة إلكترونية.</p></div></form>}
 <label className="restaurantListTools">قسم الصالة<select value={sectionFilter} onChange={e=>setSectionFilter(e.target.value)}><option value="">كل الأقسام والقنوات</option>{[...new Map(orders.filter(o=>o.dining_section_id).map(o=>[o.dining_section_id!,o.dining_snapshot?.sectionName||"قسم الصالة"])).entries()].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><div className="restaurantStatusFilters">{["all","new","preparing","ready","completed","cancelled"].map(status=><button key={status} aria-pressed={filter===status} onClick={()=>setFilter(status)}>{status==="all"?"الكل":statuses[status]}</button>)}</div>
 {loading?<p>جارٍ تحميل الطلبات…</p>:selected.length?<div className="restaurantOrderCards">{selected.map(order=><article key={order.id} data-status={order.status}><header><div className="restaurantOrderIdentity"><span className="restaurantOrderSymbol"><MerchantIcon name="bag"/></span><div><small>طلب المطعم</small><b>#{order.order_number}</b></div></div><span className="restaurantStateBadge" data-status={order.status}>{statuses[order.status]}</span></header><div className="restaurantOrderGuest"><strong>{order.customer_name||"ضيف"}</strong><span>{order.channel==="dine_in"?"داخل المطعم":order.channel==="takeaway"?"سفري":"توصيل"}</span></div><time className="restaurantOrderTime" dateTime={order.created_at}>{new Date(order.created_at).toLocaleString("ar-SA",{timeZone:"Asia/Riyadh",calendar:"gregory",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</time>{order.channel==="dine_in"&&<p className="restaurantOrderDining">{order.dining_snapshot?.sectionName} · {order.dining_snapshot?.name||"طاولة غير محددة"} · {order.party_size||"—"} أشخاص</p>}<ul>{order.items.map((item,i)=><li key={i}><span className="restaurantItemQuantity">{item.quantity} ×</span><span>{item.name}</span></li>)}</ul><footer><span className="restaurantPaymentBadge" data-status={order.payment_status}>{payments[order.payment_status]}</span>{order.total!==null&&<strong>{order.total.toFixed(2)} <small>ر.س</small></strong>}</footer>{actions(order)}</article>)}</div>:<p className="restaurantEmptyMessage">لا توجد طلبات مطابقة.</p>}
 </section>;
}
