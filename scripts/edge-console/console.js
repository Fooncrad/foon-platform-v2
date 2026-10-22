import {translations} from "./translations.js";
let language="ar";try{const saved=localStorage.getItem("foon-local-language");if(["ar","en","fr"].includes(saved))language=saved;}catch{}
const workspaceThemeLabels={
 ar:{label:"المظهر",system:"حسب الجهاز",light:"فاتح",dark:"داكن"},
 en:{label:"Appearance",system:"Use device",light:"Light",dark:"Dark"},
 fr:{label:"Apparence",system:"Selon l’appareil",light:"Clair",dark:"Sombre"}
};
let workspaceThemeMode="system";
try{const saved=localStorage.getItem("foon-workspace-theme");if(["system","light","dark"].includes(saved))workspaceThemeMode=saved;}catch{}
function applyWorkspaceTheme(){
 const shell=document.getElementById("original-workspace-shell");
 if(!shell)return;
 const systemDark=window.matchMedia?.("(prefers-color-scheme: dark)").matches||false;
 const resolved=workspaceThemeMode==="system"?(systemDark?"dark":"light"):workspaceThemeMode;
 shell.dataset.theme=resolved;shell.dataset.themePreference=workspaceThemeMode;
 const login=document.getElementById("login-panel");if(login)login.dataset.theme=resolved;
 const select=document.getElementById("w30-theme");
 if(select){
  const label=workspaceThemeLabels[language];select.value=workspaceThemeMode;
  select.setAttribute("aria-label",label.label);
  document.getElementById("w30-theme-label").textContent=label.label;
  for(const key of ["system","light","dark"])select.querySelector('option[value="'+key+'"]').textContent=label[key];
 }
}
const originals=new WeakMap();
function translateUI(){document.documentElement.lang=language;document.documentElement.dir=language==="ar"?"rtl":"ltr";document.getElementById("original-workspace-shell").dir=document.documentElement.dir;const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const current=walker.currentNode;if(current.parentElement.closest("script,style,.product strong,.product small,.cart-line b,.order-card li"))continue;const original=originals.get(current)??current.textContent;originals.set(current,original);const key=original.trim(),value=translations[key];current.textContent=value&&language!=="ar"?original.replace(key,value[language==="en"?0:1]):original;}const search=document.getElementById("search");search.placeholder=language==="ar"?"ابحث عن صنف…":translations["ابحث عن صنف…"][language==="en"?0:1];}
const $=id=>document.getElementById(id),cart=new Map();
let csrf="",state=null,mode="pos",busy=false,pendingRequest=null,uncertain=false;
let cloudModules=null;
const merchantIconMarkup={
 dashboard:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 store:'<path d="M3 10V5h18v5M3 10c0 4 6 4 6 0 0 4 6 4 6 0 0 4 6 4 6 0M5 14v7h14v-7M10 21v-6h4v6"/>',
 bag:'<rect x="4" y="7" width="16" height="14" rx="2"/><path d="M8 7V5a4 4 0 0 1 8 0v2"/>',
 wallet:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M15 14h3"/>',
 chef:'<path d="M6 13a5 5 0 0 1-1-10 5 5 0 0 1 7 0 5 5 0 0 1 7 0 5 5 0 0 1-1 10v7H6zM6 17h12"/>',
 menu:'<path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M20 21V3c-5 0-5 11 0 11"/>',
 table:'<rect x="3" y="5" width="18" height="9" rx="2"/><path d="M6 14v7M18 14v7"/>',
 box:'<path d="m12 3 9 5-9 5-9-5zM3 8v9l9 5 9-5V8M12 13v9M7 5l9 5"/>',
 users:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
 trend:'<path d="m3 17 6-6 4 4 8-10M15 5h6v6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>'
};
function merchantIcon(name){
 const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
 svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("fill","none");
 svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","1.7");
 svg.setAttribute("stroke-linecap","round");svg.setAttribute("stroke-linejoin","round");
 svg.setAttribute("aria-hidden","true");
 svg.innerHTML=merchantIconMarkup[name]||merchantIconMarkup.dashboard;
 return svg;
}
// Same group order and labels as lib/ux/merchant-navigation.ts on pinned SaaS main.
const cloudGroups=[
 {key:"daily",ar:"العمل اليومي",en:"Daily operations",fr:"Opérations quotidiennes"},
 {key:"catalog",ar:"المنتجات والمخزون",en:"Products and inventory",fr:"Produits et stocks"},
 {key:"team",ar:"الفروع والفريق",en:"Branches and team",fr:"Succursales et équipe"},
 {key:"growth",ar:"العملاء والنمو",en:"Customers and growth",fr:"Clients et croissance"},
 {key:"reports",ar:"التقارير والمالية",en:"Reports and finance",fr:"Rapports et finances"},
 {key:"settings",ar:"الإدارة والإعدادات",en:"Administration and settings",fr:"Gestion et paramètres"}
];
const cloudSectionGroups={
 assigned:"daily",overview:"daily",orders:"daily",pos:"daily",kds:"daily",
 tables:"daily",roomService:"daily",serviceOrders:"daily",quotes:"daily",reservations:"daily",
 pickupPoints:"daily",menu:"catalog",inventory:"catalog",branches:"team",team:"team",
 remote:"team",customers:"growth",marketing:"growth",reports:"reports",printers:"reports",
 payments:"reports",storefront:"settings",publicControls:"settings",security:"settings",
 health:"settings",subscription:"settings"
};
const collapsedCloudGroups=new Set();
const localRoles={
 ar:{owner:"مالك النشاط",manager:"المدير",cashier:"الكاشير",kitchen:"المطبخ"},
 en:{owner:"Owner",manager:"Manager",cashier:"Cashier",kitchen:"Kitchen"},
 fr:{owner:"Propriétaire",manager:"Responsable",cashier:"Caissier",kitchen:"Cuisine"}
};
let mobileMenuOpen=false;
function closeMobileMenu(){
 mobileMenuOpen=false;
 $("original-workspace-shell").classList.remove("w30-mobile-open");
 $("w30-mobile-trigger").setAttribute("aria-expanded","false");
 $("w30-sidebar-overlay").hidden=true;
}
function renderCloudNavigation(){
 const navigation=$("cloud-navigation");
 if(!navigation||!state||!cloudModules)return;
 const current=mode==="pos"?"pos":"kds";
 const signature=state.user.role+":"+language+":"+current;
 if(navigation.dataset.signature===signature)return;
 navigation.replaceChildren();
 // Only modules returned by the authenticated server are used. Disabled sections
 // do not grant access to APIs and never display a fake working page.
 for(const group of cloudGroups){
  const items=cloudModules.filter(section=>cloudSectionGroups[section.key]===group.key);
  if(!items.length)continue;
  const groupSection=node("section",undefined,"restaurantNavTaskGroup");
  groupSection.dataset.navGroup=group.key;
  const toggle=node("button",undefined,"restaurantNavGroupToggle");
  toggle.type="button";
  const collapsed=collapsedCloudGroups.has(group.key);
  toggle.setAttribute("aria-expanded",String(!collapsed));
  toggle.append(node("span",group[language]),node("span",String(items.length),"restaurantNavGroupCount"),node("span",collapsed?"⌄":"⌃","restaurantNavChevron"));
  toggle.onclick=()=>{if(collapsedCloudGroups.has(group.key))collapsedCloudGroups.delete(group.key);else collapsedCloudGroups.add(group.key);navigation.dataset.signature="";renderCloudNavigation();};
  groupSection.append(toggle);
  if(!collapsed){
   const children=node("div",undefined,"restaurantNavGroupItems");
   for(const section of items){
    const button=node("button");
    button.type="button";button.dataset.module=section.key;
    const label=language==="ar"?section.label:section[language]||section.label;
    button.append(merchantIcon(section.icon),node("span",label));
    if(section.offlineWorking){
     if(section.key===current||(current==="kds"&&section.key==="orders"))button.setAttribute("aria-current","page");
     button.onclick=()=>{mode=section.key==="pos"?"pos":"kds";closeMobileMenu();render();};
    }else{
     button.disabled=true;button.setAttribute("aria-disabled","true");
     button.title=language==="en"?"Not ported to local operations":language==="fr"?"Non disponible hors ligne":"غير منفذ في التشغيل المحلي";
     button.append(node("small",language==="ar"?"قيد الربط":language==="en"?"Pending":"À relier"));
    }
    children.append(button);
   }
   groupSection.append(children);
  }
  navigation.append(groupSection);
 }
 navigation.dataset.signature=signature;
 $("navigation-shell").hidden=false;
 $("w30-nav-context").textContent="FOON DEMO · "+(localRoles[language][state.user.role]||state.user.role);
 $("desktop-heading").textContent=language==="ar"?(mode==="pos"?"نقطة البيع":"المطبخ والطلبات"):language==="en"?(mode==="pos"?"Point of sale":"Kitchen and orders"):(mode==="pos"?"Point de vente":"Cuisine et commandes");
}
const statuses={new:"جديد",preparing:"قيد التحضير",ready:"جاهز",completed:"مكتمل",cancelled:"ملغي"};
const errors={UNAUTHORIZED:"سجل الدخول إلى المحطة.",FORBIDDEN:"لا تملك صلاحية هذه العملية.",OFFLINE_AUTHORIZATION_EXPIRED:"انتهت صلاحية التشغيل المحلي. أعد الاتصال لتجديدها.",TOO_MANY_ATTEMPTS:"محاولات دخول كثيرة؛ انتظر دقيقة ثم حاول.",IDEMPOTENCY_CONFLICT:"تعارض في معرف الطلب. راجع الطلب المحفوظ قبل إعادة المحاولة.",INVALID_STATUS_TRANSITION:"تغيّرت حالة الطلب؛ حدّث القائمة.",LOCAL_SERVICE_UNAVAILABLE:"المحطة المحلية غير متاحة حاليًا. احتفظ بالسلة وأعد المحاولة.",INVALID_ORDER:"راجع أصناف الطلب وكمياتها."};
function message(text){$("message").textContent=text;translateUI();}
async function api(path,method="GET",body){const r=await fetch(path,{method,headers:{"content-type":"application/json","x-foon-csrf":csrf},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok){if(r.status===401){$("workspace").hidden=true;$("login-panel").hidden=false;$("logout").hidden=true;}const error=Error(errors[data.error]||"تعذر تنفيذ العملية. بقيت البيانات المحفوظة على المحطة.");error.status=r.status;throw error;}return data;}
function node(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
function price(item){return Number(item.price);}
function renderCart(){const lines=$("cart-lines");lines.replaceChildren();let total=0;for(const [id,quantity] of cart){const item=state.menu.find(item=>item.id===id)||{name:"صنف غير متاح",price:"0",currency:"—"};total+=Math.round(price(item)*100)*quantity;const line=node("div",undefined,"cart-line"),name=node("div"),controls=node("div",undefined,"quantity");name.append(node("b",item.name),node("small",price(item).toFixed(2)+" "+item.currency));for(const delta of [-1,1]){const button=node("button",delta<0?"−":"+");button.setAttribute("aria-label",(delta<0?"تقليل ":"زيادة ")+item.name);button.disabled=busy||uncertain;button.onclick=()=>{const next=quantity+delta;if(next>1000)return;if(next<=0)cart.delete(id);else cart.set(id,next);pendingRequest=null;renderCart();};if(delta===1)controls.append(node("span",String(quantity)));controls.append(button);}line.append(name,controls);lines.append(line);}const selected=Array.from(cart.keys()).map(id=>state.menu.find(item=>item.id===id)),currencies=new Set(selected.filter(Boolean).map(item=>item.currency)),invalid=selected.some(item=>!item)||currencies.size>1;$("cart-total").textContent=invalid?"راجع أصناف الطلب":(total/100).toFixed(2)+" "+([...currencies][0]||"SAR");$("checkout").disabled=busy||!cart.size||invalid;}
function renderMenu(){const menu=$("menu"),query=$("search").value.trim();menu.replaceChildren();for(const item of state.menu.filter(item=>item.name.includes(query))){const button=node("button",undefined,"product");button.append(node("small",item.category),node("strong",item.name),node("b",price(item).toFixed(2)+" "+item.currency),node("span","+ إضافة"));button.disabled=busy||uncertain;button.onclick=()=>{const next=(cart.get(item.id)||0)+1;if(next>1000)return;cart.set(item.id,next);pendingRequest=null;renderCart();};menu.append(button);}if(!menu.children.length)menu.append(node("p","لا توجد أصناف متاحة في المنيو المحلي البسيط."));}
function renderOrders(){const root=$("orders");root.replaceChildren();for(const order of state.orders){const card=node("article",undefined,"order-card"),head=node("header"),list=node("ul"),footer=node("footer");head.append(node("strong","#"+order.id.slice(0,8)),node("span",statuses[order.status]||order.status,"badge"));card.append(head,node("time",new Date(order.createdAt).toLocaleString(language==="ar"?"ar-SA-u-nu-latn":language==="en"?"en-GB":"fr-FR",{calendar:"gregory"})),node("span",order.pending?(state.sync.state==="offline-only"?"محفوظ محليًا — لم يُرسل للسحابة":"بانتظار السحابة"):"مؤكد من السحابة","badge"+(order.pending?" pending":"")));for(const item of order.items){const name=item.name||state.menu.find(product=>product.id===item.id)?.name||item.id;list.append(node("li",item.quantity+" × "+name+(item.options?.length?" — "+item.options.join("، "):"")));}if(order.location)card.append(node("p",order.location));else card.append(node("p",({takeaway:"سفري",dine_in:"داخل المطعم",delivery:"توصيل"})[order.channel]||order.channel));card.append(list);if(order.error){card.append(node("p",({EDGE_CATALOG_PRICE_CHANGED:"تغير سعر صنف أثناء الانقطاع؛ راجع السعر قبل إعادة المحاولة.",EDGE_ORDER_ID_CONFLICT:"يوجد طلب سحابي بهذا المعرف؛ راجع سجل السحابة.",EDGE_IDEMPOTENCY_CONFLICT:"تعارض في بيانات الطلب؛ يحتاج مراجعة."})[order.error]||"رفضت السحابة التغيير؛ يحتاج مراجعة."));const retry=node("button","إعادة المحاولة بعد المراجعة");retry.onclick=async()=>{retry.disabled=true;try{await api("/api/orders/"+order.id+"/retry","POST",{});message("أُعيدت محاولة الأحداث التابعة لحسابك. لم تتغير بيانات الطلب.");await refresh();}catch(error){message(error.message);}finally{retry.disabled=false;}};if(order.canRetry)footer.append(retry);}const next={new:"preparing",preparing:"ready",ready:"completed"}[order.status];if(next&&(state.user.role!=="kitchen"||["preparing","ready"].includes(next))){const button=node("button",statuses[next]);button.disabled=busy;button.onclick=async()=>{button.disabled=true;try{await api("/api/orders/"+order.id+"/status","PATCH",{status:next});await refresh();message("تم تحديث الطلب محليًا؛ يُؤكد وصول التغيير بعد المزامنة.");}catch(error){message(error.message);}finally{button.disabled=false;}};footer.append(button);}card.append(footer);root.append(card);}if(!state.orders.length)root.append(node("p","لا توجد طلبات محفوظة على المحطة."));}
function render(){const kitchen=state.user.role==="kitchen";if(kitchen)mode="kds";$("w30-role-badge").textContent=localRoles[language][state.user.role]||state.user.role;$("w30-expand-workspace").hidden=false;$("pos-tab").hidden=kitchen;$("pos-layout").hidden=mode!=="pos";$("title").textContent=mode==="pos"?"نقطة البيع":"المطبخ والطلبات";$("pos-tab").setAttribute("aria-pressed",String(mode==="pos"));$("kds-tab").setAttribute("aria-pressed",String(mode==="kds"));$("pending-count").textContent=String(state.pending);$("sync-state").textContent=({synced:"متصل بالسحابة",retry:"إعادة المحاولة",conflict:"يحتاج مراجعة",offline:"بانتظار الاتصال","offline-only":"دون إنترنت — المزامنة متوقفة"})[state.sync.state]||"بانتظار الاتصال";$("connection").textContent=state.sync.state==="synced"?"السحابة متصلة":"التشغيل المحلي";$("catalog-time").textContent=new Date(state.savedAt).toLocaleString(language==="ar"?"ar-SA-u-nu-latn":language==="en"?"en-GB":"fr-FR",{calendar:"gregory"});renderMenu();renderCart();renderOrders();renderCloudNavigation();if(cloudModules){$("pos-tab").hidden=!cloudModules.some(section=>section.key==="pos");$("kds-tab").hidden=!cloudModules.some(section=>section.key==="kds"||section.key==="orders");}translateUI();}
async function refresh(){try{state=await api("/api/state");if(uncertain&&pendingRequest&&state.orders.some(order=>order.id===pendingRequest.id)){cart.clear();pendingRequest=null;uncertain=false;message("تأكد حفظ الطلب على المحطة؛ لم يُنشأ طلب آخر.");}csrf=state.csrf;if(!cloudModules){try{const inventory=await api("/api/cloud-ui-inventory");cloudModules=inventory.modules;if(inventory.activities.includes(inventory.activityCode))$("original-workspace-shell").dataset.activity=inventory.activityCode;}catch{message("تعذر تحميل فهرس أقسام الموقع الأصلي للمحطة.");}}$("workspace").hidden=false;$("login-panel").hidden=true;$("logout").hidden=false;render();}catch(error){message(error.message);}}
$("login-form").onsubmit=async event=>{event.preventDefault();const formElement=event.currentTarget,form=new FormData(formElement),button=formElement.querySelector("button");button.disabled=true;try{const login=await api("/api/login","POST",{username:form.get("username"),password:form.get("password")});csrf=login.csrf;formElement.reset();message("");await refresh();}catch(error){message(error.message);}finally{button.disabled=false;}};
$("logout").onclick=async()=>{try{await api("/api/logout","POST",{});cart.clear();state=null;csrf="";cloudModules=null;closeMobileMenu();$("original-workspace-shell").classList.remove("restaurantAppWide");$("w30-expand-workspace").hidden=true;$("navigation-shell").hidden=true;$("cloud-navigation").dataset.signature="";$("workspace").hidden=true;$("login-panel").hidden=false;$("logout").hidden=true;}catch(error){message(error.message);}};
$("w30-mobile-trigger").onclick=()=>{mobileMenuOpen=!mobileMenuOpen;$("original-workspace-shell").classList.toggle("w30-mobile-open",mobileMenuOpen);$("w30-mobile-trigger").setAttribute("aria-expanded",String(mobileMenuOpen));$("w30-sidebar-overlay").hidden=!mobileMenuOpen;};
$("w30-sidebar-overlay").onclick=closeMobileMenu;
$("w30-expand-workspace").onclick=()=>{const shell=$("original-workspace-shell"),expanded=shell.classList.toggle("restaurantAppWide");$("w30-expand-workspace").setAttribute("aria-pressed",String(expanded));$("w30-expand-workspace").title=expanded?"إظهار الشريط الجانبي":"تكبير مساحة العمل";closeMobileMenu();};
$("search").oninput=()=>{if(state)renderMenu();};$("pos-tab").onclick=()=>{mode="pos";render();};$("kds-tab").onclick=()=>{mode="kds";render();};$("refresh").onclick=()=>void refresh();
$("checkout").onclick=async()=>{if(busy||!cart.size)return;busy=true;render();const items=Array.from(cart,([id,quantity])=>({id,quantity}));if(!pendingRequest)pendingRequest={id:crypto.randomUUID(),items};try{await api("/api/orders","POST",pendingRequest);cart.clear();pendingRequest=null;uncertain=false;message("حُفظ الطلب على المحطة. لم يُسجل أي دفع إلكتروني.");await refresh();}catch(error){uncertain=!(error.status>=400&&error.status<500);if(!uncertain)pendingRequest=null;message(error.message);}finally{busy=false;if(state)render();}};
$("language").value=language;
$("language").onchange=()=>{language=$("language").value;try{localStorage.setItem("foon-local-language",language);}catch{}if(state)render();else translateUI();applyWorkspaceTheme();};
$("w30-theme").onchange=()=>{const v=$("w30-theme").value;if(!["system","light","dark"].includes(v))return;workspaceThemeMode=v;try{localStorage.setItem("foon-workspace-theme",v);}catch{}applyWorkspaceTheme();};
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change",()=>{if(workspaceThemeMode==="system")applyWorkspaceTheme();});
translateUI();applyWorkspaceTheme();
setInterval(()=>{if(state&&!busy)void refresh();},3000);void refresh();
