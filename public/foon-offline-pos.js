/* FOON V2 cloud: data-free offline POS shell. No authenticated SSR/HTML cache.
   Browser storage is device-local, passphrase-encrypted and scoped to a previously
   authorized user, tenant and branch. Server remains authoritative on sync. */
(()=>{
"use strict";
const DB="foon-pos-secure-v1",VERSION=1,TTL=8*60*60*1000,IDLE=15*60*1000,ITERATIONS=310000;
const $=id=>document.getElementById(id),enc=new TextEncoder(),dec=new TextDecoder();
const params=new URLSearchParams(location.search);
const tenant=params.get("tenant")||"",branch=params.get("branch")||"";
const idPattern=/^[a-f0-9-]{36}$/i;
let active=null,expiryTimer=null,cart=new Map(),lastAction=Date.now();
const notice=(message,error=false)=>{const el=$("notice");el.textContent=message;el.dataset.error=String(error);};
const setHidden=(name,hidden)=>{$(name).hidden=hidden;};
function db(){
 return new Promise((resolve,reject)=>{
  const r=indexedDB.open(DB,VERSION);
  r.onupgradeneeded=()=>{
   for(const name of ["profiles","orders"])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name,{keyPath:"id"});
  };
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
 });
}
async function tx(store,mode,action){
 const database=await db();
 return new Promise((resolve,reject)=>{
  const trx=database.transaction(store,mode),bucket=trx.objectStore(store);
  let result;try{const request=action(bucket);request.onsuccess=()=>{result=request.result;};}catch(error){database.close();reject(error);return;}
  trx.oncomplete=()=>{database.close();resolve(result);};
  trx.onabort=()=>{database.close();reject(trx.error||new Error("STORE_ABORTED"));};
  trx.onerror=()=>{database.close();reject(trx.error||new Error("STORE_FAILED"));};
 });
}
const all=store=>tx(store,"readonly",s=>s.getAll());
const get=(store,id)=>tx(store,"readonly",s=>s.get(id));
const put=(store,obj)=>tx(store,"readwrite",s=>s.put(obj));
const del=(store,id)=>tx(store,"readwrite",s=>s.delete(id));
const bytes=n=>crypto.getRandomValues(new Uint8Array(n));
function idOf(user,tenantId,branchId){return [user,tenantId,branchId].join(":");}
async function keyFor(passphrase,salt){
 const raw=await crypto.subtle.importKey("raw",enc.encode(passphrase),"PBKDF2",false,["deriveKey"]);
 return crypto.subtle.deriveKey({name:"PBKDF2",salt:new Uint8Array(salt),iterations:ITERATIONS,hash:"SHA-256"},raw,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function seal(key,id,kind,payload){
 const iv=bytes(12),plaintext=enc.encode(JSON.stringify(payload));
 const data=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:enc.encode(id+"|"+kind)},key,plaintext);
 return {iv:Array.from(iv),cipher:Array.from(new Uint8Array(data))};
}
async function unseal(key,id,kind,record){
 const data=await crypto.subtle.decrypt({name:"AES-GCM",iv:new Uint8Array(record.iv),additionalData:enc.encode(id+"|"+kind)},key,new Uint8Array(record.cipher));
 return JSON.parse(dec.decode(data));
}
async function json(url,opts={}){
 const res=await fetch(url,{...opts,cache:"no-store",credentials:"same-origin",headers:{...(opts.headers||{}),"Cache-Control":"no-store"}});
 const body=await res.json().catch(()=>({}));
 if(!res.ok||!body.ok)throw new Error(res.status===401?"SESSION_EXPIRED":res.status===403?"ACCESS_DENIED":body.code||"SERVER_ERROR");
 return body;
}
async function authorized(tenantId,branchId,expectedUser){
 if(!navigator.onLine)throw new Error("INTERNET_REQUIRED");
 const me=await json("/api/auth/me");
 const user=String(me.user?.id||"");
 if(!idPattern.test(user)||expectedUser&&user!==expectedUser)throw new Error("USER_CHANGED");
 const data=await json("/api/restaurant/operations/pos?branch="+encodeURIComponent(branchId),{headers:{"x-foon-tenant":tenantId,"x-foon-branch":branchId}});
 return {user,data};
}
const localeLabels={
 ar:{unlock:"تم فتح النسخة المحلية.",locked:"البيانات مقفلة.",prepared:"تم إعداد النسخة مشفرة لهذا المستخدم والمتجر والفرع.",saved:"حُفظ الطلب مشفرًا ولم يصل للمطعم بعد.",empty:"أضف أصنافًا أولاً.",expired:"انتهت صلاحية النسخة. أعد إعدادها أثناء الاتصال.",bad:"عبارة المرور غير صحيحة، أو النسخة تالفة.",sync:"اكتملت محاولة المزامنة. راجع النتائج.",review:"الطلب يحتاج مراجعة قبل إعادة إرساله.",lockedOut:"انتهت مدة العمل المحلية؛ أعد فتح النسخة."},
 en:{unlock:"Local profile unlocked.",locked:"Private data locked.",prepared:"Encrypted local profile prepared.",saved:"Order encrypted locally; not yet delivered.",empty:"Add items first.",expired:"Local authorization expired. Prepare again online.",bad:"Incorrect passphrase or corrupted profile.",sync:"Sync attempt completed. Review results.",review:"Order requires manual review.",lockedOut:"Local session timed out. Unlock again."},
 fr:{unlock:"Profil local déverrouillé.",locked:"Données privées verrouillées.",prepared:"Profil local chiffré préparé.",saved:"Commande chiffrée localement, non envoyée.",empty:"Ajoutez des articles.",expired:"Autorisation locale expirée. Préparez de nouveau en ligne.",bad:"Phrase secrète incorrecte ou profil corrompu.",sync:"Synchronisation terminée. Vérifiez les résultats.",review:"Commande à vérifier.",lockedOut:"Session locale expirée. Déverrouillez à nouveau."}
};
const language=location.search.includes("lang=fr")?"fr":location.search.includes("lang=en")?"en":"ar",msg=k=>localeLabels[language][k];
if(language!=="ar"){document.documentElement.lang=language;document.documentElement.dir="ltr";}
function lock(message=msg("locked")){
 active=null;cart.clear();clearTimeout(expiryTimer);
 setHidden("workspace",true);setHidden("locked",false);setHidden("setup",!(idPattern.test(tenant)&&idPattern.test(branch)));
 $("unlock-pass").value="";$("setup-pass").value="";
 $("catalog").replaceChildren();$("queue").replaceChildren();$("cart").replaceChildren();
 notice(message);
}
function bump(){
 if(!active)return;
 lastAction=Date.now();clearTimeout(expiryTimer);
 expiryTimer=setTimeout(()=>lock(msg("lockedOut")),IDLE);
}
function valid(){
 if(!active)throw new Error("PROFILE_LOCKED");
 if(Date.now()>Date.parse(active.data.expiresAt)||Date.now()>Date.parse(active.record.expiresAt)){lock(msg("expired"));throw new Error("PROFILE_EXPIRED");}
 if(Date.now()-lastAction>IDLE){lock(msg("lockedOut"));throw new Error("PROFILE_LOCKED");}
 bump();return active;
}
async function refreshProfiles(){
 const rows=await all("profiles"),list=$("profiles"),selected=list.value;
 list.replaceChildren(new Option("اختر النسخة",""));
 for(const row of rows.sort((a,b)=>b.savedAt.localeCompare(a.savedAt))){
  const option=new Option("نسخة "+String(row.id).slice(-8)+" · "+new Date(row.savedAt).toLocaleString(),row.id);
  list.add(option);
 }
 if(rows.some(row=>row.id===selected))list.value=selected;
 else if(rows.length===1)list.value=rows[0].id;
}
async function prepare(){
 if(!idPattern.test(tenant)||!idPattern.test(branch))throw new Error("OPEN_FROM_POS_BRANCH");
 const pass=$("setup-pass").value;
 if(pass.length<12||pass.length>128)throw new Error("PASSPHRASE_12_REQUIRED");
 const {user,data}=await authorized(tenant,branch);
 const id=idOf(user,tenant,branch),prior=await get("profiles",id);
 const salt=prior?.salt||Array.from(bytes(16)),key=await keyFor(pass,salt);
 if(prior){try{await unseal(key,id,"profile",prior);}catch{throw new Error("EXISTING_PROFILE_PASSPHRASE_REQUIRED");}}
 const now=new Date().toISOString(),expiresAt=new Date(Date.now()+TTL).toISOString();
 // Deliberately exclude customers, orders, private staff data and auth tokens.
 const publicCatalog={userId:user,tenantId:tenant,branchId:branch,menu:data.menu||[],tables:data.tables||[],options:data.options||{},currency:String(data.currency||"SAR"),checkoutPolicy:data.checkoutPolicy||null,savedAt:now,expiresAt};
 const encrypted=await seal(key,id,"profile",publicCatalog);
 await put("profiles",{id,salt,...encrypted,savedAt:now,expiresAt,reauthRequired:false});
 $("setup-pass").value="";await refreshProfiles();$("profiles").value=id;
 await openProfile(id,pass);notice(msg("prepared"));
}
async function openProfile(id,pass){
 let record=await get("profiles",id);
 if(!record||!pass)throw new Error("PROFILE_NOT_FOUND");
 const key=await keyFor(pass,record.salt);
 let data;try{data=await unseal(key,id,"profile",record);}catch{throw new Error(msg("bad"));}
 if(id!==idOf(data.userId,data.tenantId,data.branchId))throw new Error("SCOPE_MISMATCH");
 if(record.reauthRequired||Date.now()>Date.parse(data.expiresAt)||Date.now()>Date.parse(record.expiresAt)){
  // Logout, account switch or expiry blocks offline access. Pending encrypted
  // orders are retained and can be recovered after new server authentication.
  if(!navigator.onLine)throw new Error(msg("expired"));
  const access=await authorized(data.tenantId,data.branchId,data.userId);
  const now=new Date().toISOString(),expiresAt=new Date(Date.now()+TTL).toISOString();
  data={...data,menu:access.data.menu||[],tables:access.data.tables||[],options:access.data.options||{},savedAt:now,expiresAt};
  record={...record,...await seal(key,id,"profile",data),savedAt:now,expiresAt,reauthRequired:false};
  await put("profiles",record);
 }
 active={record,data,key};
 cart.clear();setHidden("locked",true);setHidden("setup",true);setHidden("workspace",false);
 $("unlock-pass").value="";$("scope").textContent="فرع "+data.branchId.slice(-8)+" · "+new Date(data.expiresAt).toLocaleString();
 bump();renderCatalog();await renderQueue();notice(msg("unlock"));
}
const simpleItem=(item,options)=>item&&item.status==="active"&&item.data&&Number.isFinite(Number(item.data.price))&&Number(item.data.price)>=0&&!item.data.measured&&!(Array.isArray(item.data.variants)&&item.data.variants.length>0)&&!(Array.isArray(options?.[item.id])&&options[item.id].length>0);
function permittedItems(){
 const {data}=valid();return (data.menu||[]).filter(item=>simpleItem(item,data.options));
}
function renderCatalog(){
 const {data}=valid(),catalog=$("catalog");catalog.replaceChildren();
 for(const item of permittedItems()){
  const el=document.createElement("div");el.className="item";
  const name=document.createElement("strong");name.textContent=String(item.name||"");
  const price=document.createElement("small");price.textContent=Number(item.data.price).toFixed(2)+" "+data.currency;
  const btn=document.createElement("button");btn.type="button";btn.textContent="+";
  btn.addEventListener("click",()=>{valid();cart.set(item.id,(cart.get(item.id)||0)+1);renderCart();});
  el.append(name,price,document.createElement("br"),btn);catalog.append(el);
 }
 if(!catalog.children.length)catalog.textContent="لا توجد أصناف بسيطة متاحة دون اتصال؛ الأصناف ذات الخيارات أو المقاسات تُطلب بعد عودة الإنترنت.";
 const tableSelect=$("table");tableSelect.replaceChildren(new Option("اختر الطاولة",""));
 for(const t of data.tables||[]){if(t.status==="available"){tableSelect.add(new Option(String(t.name||t.id),String(t.id)));}}
 $("channel").querySelector('option[value="dine_in"]').hidden=!(data.tables||[]).length;
 if(!(data.tables||[]).length)$("channel").value="takeaway";
 renderCart();showTable();
}
function renderCart(){
 valid();const el=$("cart");el.replaceChildren();let total=0;
 for(const [id,quantity] of cart){
  const item=active.data.menu.find(row=>row.id===id);if(!item)continue;
  total+=Number(item.data.price)*quantity;
  const line=document.createElement("div");line.className="row";
  const desc=document.createElement("span");desc.textContent=String(item.name)+" × "+quantity;
  const minus=document.createElement("button");minus.type="button";minus.className="secondary";minus.textContent="−";
  minus.addEventListener("click",()=>{valid();if(quantity<=1)cart.delete(id);else cart.set(id,quantity-1);renderCart();});
  line.append(desc,minus);el.append(line);
 }
 const totalEl=document.createElement("p");totalEl.textContent="تقدير الأصناف قبل تسعير الخادم: "+total.toFixed(2)+" "+active.data.currency;el.append(totalEl);
}
function showTable(){$("table-group").hidden=$("channel").value!=="dine_in";}
async function scopedOrders(){
 const {record}=valid(),rows=await all("orders");return rows.filter(row=>row.profileId===record.id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
}
async function decodedOrders(){
 const {key,record}=valid(),rows=await scopedOrders(),output=[];
 for(const row of rows){try{const item=await unseal(key,record.id,"order:"+row.orderId,row);if(item.id===row.orderId&&item.payload?.requestKey===row.orderId&&item.payload.branchId===active.data.branchId)output.push({row,item});else throw new Error("INVALID_ORDER");}
 catch{output.push({row,item:null});}}
 return output;
}
async function renderQueue(){
 const el=$("queue");el.replaceChildren();
 for(const {row,item} of await decodedOrders()){
  const p=document.createElement("p");
  p.textContent=(item?.id||row.orderId)+" · "+(item?.status||"CORRUPTED")+" · "+(item?.lastError||"");
  el.append(p);
  if(item?.status==="needs_review"){
   const retry=document.createElement("button");retry.type="button";retry.className="secondary";
   retry.textContent="إعادة إدراج بعد مراجعة الطلب لدى المطعم";
   retry.addEventListener("click",()=>{Promise.resolve().then(async()=>{
    valid();const reset={...item,status:"pending",lastError:undefined};
    const updated=await seal(active.key,active.record.id,"order:"+item.id,reset);
    await put("orders",{...row,...updated});await renderQueue();
    notice("يُرجى التأكد أن الطلب لم ينفذ سابقًا. سيعاد فحصه عند المزامنة.");
   }).catch(error=>notice(String(error.message||error),true));});
   el.append(retry);
  }
 }
 if(!el.children.length)el.textContent="لا توجد طلبات محلية معلقة.";
}
async function saveOrder(){
 const {data,key,record}=valid(),channel=$("channel").value;
 if(!cart.size)throw new Error(msg("empty"));
 if(!["takeaway","dine_in"].includes(channel))throw new Error("INVALID_CHANNEL");
 const queue=(await decodedOrders()).map(x=>x.item).filter(Boolean);
 const tableId=channel==="dine_in"?$("table").value:null,partySize=channel==="dine_in"?Number($("party").value):null;
 if(channel==="dine_in"){
  const table=data.tables.find(t=>t.id===tableId&&t.status==="available");
  if(!table)throw new Error("TABLE_NOT_AVAILABLE");
  const capacity=Number(table.data?.capacity);
  if(!Number.isInteger(partySize)||partySize<1||!Number.isInteger(capacity)||partySize>capacity)throw new Error("INVALID_PARTY_SIZE");
  if(queue.some(q=>q.payload?.channel==="dine_in"&&q.payload.tableId===tableId))throw new Error("TABLE_ALREADY_QUEUED");
 }
 const items=[...cart].map(([id,quantity])=>({id,quantity,options:[]}));
 if(items.some(row=>!permittedItems().some(item=>item.id===row.id)||!Number.isInteger(row.quantity)||row.quantity<1||row.quantity>999))throw new Error("ITEM_NOT_ALLOWED");
 const id=crypto.randomUUID(),payload={branchId:data.branchId,currency:data.currency,channel,tableId,partySize,customerName:"",customerPhone:"",couponCode:null,kitchenNotes:null,orderNotes:null,items,requestKey:id};
 const order={id,payload,status:"pending",createdAt:new Date().toISOString()};
 const cipher=await seal(key,record.id,"order:"+id,order);
 await put("orders",{id:record.id+"|"+id,profileId:record.id,orderId:id,createdAt:order.createdAt,...cipher});
 cart.clear();renderCart();await renderQueue();notice(msg("saved"));
}
async function sync(){
 const {record,data}=valid();
 if(!navigator.onLine)throw new Error("INTERNET_REQUIRED");
 if(!navigator.locks?.request)throw new Error("WEB_LOCKS_REQUIRED");
 const run=async()=>{
  const access=await authorized(data.tenantId,data.branchId,data.userId);
  if(access.user!==data.userId)throw new Error("USER_CHANGED");
  for(const {row,item} of await decodedOrders()){
   if(!item||item.status==="needs_review")continue;
   try{
    await json("/api/restaurant/operations/pos",{method:"POST",headers:{"content-type":"application/json","x-foon-tenant":data.tenantId,"x-foon-branch":data.branchId},body:JSON.stringify(item.payload)});
    await del("orders",row.id);
   }catch(error){
    if(["SESSION_EXPIRED","USER_CHANGED","ACCESS_DENIED"].includes(error.message)){lock("انتهت صلاحيات الحساب. تحقق من تسجيل الدخول قبل مزامنة الطلبات.");throw error;}
    if(error instanceof TypeError||!navigator.onLine)throw new Error("NETWORK_UNAVAILABLE_ORDERS_RETAINED");
    const changed={...item,status:"needs_review",lastError:String(error.message)};
    const cipher=await seal(active.key,record.id,"order:"+item.id,changed);
    await put("orders",{...row,...cipher});
   }
  }
 };
 await navigator.locks.request("foon-pos-secure-sync-"+record.id,{mode:"exclusive",ifAvailable:true},async locked=>{
  if(!locked)throw new Error("SYNC_ALREADY_RUNNING");await run();
 });
 if(active){await renderQueue();notice(msg("sync"));}
}
async function refresh(){
 const {record,data}=valid();
 if(!navigator.onLine)throw new Error("INTERNET_REQUIRED");
 const access=await authorized(data.tenantId,data.branchId,data.userId);
 const now=new Date().toISOString(),expiresAt=new Date(Date.now()+TTL).toISOString();
 const update={...data,menu:access.data.menu||[],tables:access.data.tables||[],options:access.data.options||{},currency:String(access.data.currency||data.currency),checkoutPolicy:access.data.checkoutPolicy||null,savedAt:now,expiresAt};
 const encrypted=await seal(active.key,record.id,"profile",update);
 const next={...record,...encrypted,savedAt:now,expiresAt,reauthRequired:false};
 await put("profiles",next);active={record:next,data:update,key:active.key};cart.clear();renderCatalog();await refreshProfiles();notice("تم تحديث بيانات الفرع بعد التحقق من الصلاحية.");
}
async function exportEncrypted(){
 const {record}=valid(),orders=await scopedOrders(),content=JSON.stringify({format:"foon-pos-encrypted-backup-v1",profile:record,orders});
 const url=URL.createObjectURL(new Blob([content],{type:"application/json"}));
 const anchor=document.createElement("a");anchor.href=url;anchor.download="foon-encrypted-pos-"+new Date().toISOString().slice(0,10)+".json";anchor.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importEncrypted(event){
 const file=event.target.files?.[0];event.target.value="";
 if(!file)return;
 if(file.size>5000000)throw new Error("BACKUP_TOO_LARGE");
 const parsed=JSON.parse(await file.text());
 if(parsed?.format!=="foon-pos-encrypted-backup-v1"||!parsed.profile||!Array.isArray(parsed.orders)||parsed.orders.length>500)throw new Error("INVALID_ENCRYPTED_BACKUP");
 const profile=parsed.profile;
 if(!profile.id||!Array.isArray(profile.salt)||profile.salt.length!==16)throw new Error("INVALID_BACKUP_SCOPE");
 // Import only for a profile the operator already unlocked. Recovery of a
 // lost profile requires a separately authenticated online restoration flow.
 const {record,key,data}=valid();
 if(profile.id!==record.id||JSON.stringify(profile.salt)!==JSON.stringify(record.salt))throw new Error("BACKUP_DIFFERENT_USER_BRANCH");
 const decrypted=await unseal(key,profile.id,"profile",profile);
 if(decrypted.userId!==data.userId||decrypted.tenantId!==data.tenantId||decrypted.branchId!==data.branchId)throw new Error("BACKUP_DIFFERENT_SCOPE");
 const prepared=[];
 for(const row of parsed.orders){
  if(row.profileId!==record.id||!idPattern.test(row.orderId)||row.id!==record.id+"|"+row.orderId)throw new Error("BACKUP_DIFFERENT_SCOPE");
  const item=await unseal(key,record.id,"order:"+row.orderId,row);
  if(item.id!==row.orderId||item.payload?.requestKey!==item.id||item.payload?.branchId!==data.branchId||!["pending","needs_review"].includes(item.status))throw new Error("INVALID_BACKUP_ORDER");
  prepared.push(row);
 }
 if(new Set(prepared.map(row=>row.id)).size!==prepared.length)throw new Error("DUPLICATE_BACKUP_ORDER");
 let restored=0;
 for(const row of prepared){
  const old=await get("orders",row.id);
  if(old){const existing=await unseal(key,record.id,"order:"+row.orderId,old);
   const incoming=await unseal(key,record.id,"order:"+row.orderId,row);
   if(JSON.stringify(existing.payload)!==JSON.stringify(incoming.payload))throw new Error("BACKUP_ORDER_CONFLICT");
  }else{await put("orders",row);restored++;}
 }
 await renderQueue();notice("تمت استعادة "+restored+" طلبات مشفرة، دون مسح أو استبدال الطلبات الموجودة.");
}

const LEGACY_DB="foon-pos-offline-v1";
async function legacyDB(){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(LEGACY_DB,2);
  req.onupgradeneeded=()=>{
   for(const name of ["orders","snapshots"])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name,{keyPath:"id"});
  };
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
async function legacyAction(store,mode,fn){
 const database=await legacyDB();
 return new Promise((resolve,reject)=>{
  const transaction=database.transaction(store,mode),request=fn(transaction.objectStore(store));
  let value;
  request.onsuccess=()=>{value=request.result;};
  transaction.oncomplete=()=>{database.close();resolve(value);};
  transaction.onerror=()=>{database.close();reject(transaction.error||new Error("LEGACY_DATABASE_FAILED"));};
  transaction.onabort=()=>{database.close();reject(transaction.error||new Error("LEGACY_DATABASE_ABORTED"));};
 });
}
async function legacyDeleteVerified(prior){
 const database=await legacyDB();
 return new Promise((resolve,reject)=>{
  const trans=database.transaction("orders","readwrite"),store=trans.objectStore("orders"),get=store.get(prior.id);
  let removalConfirmed=false;
  get.onsuccess=()=>{
   // Another tab might have updated payment/review status since the copy.
   // Never discard that fresher version; the operator must retry recovery.
   if(JSON.stringify(get.result)!==JSON.stringify(prior)){trans.abort();return;}
   try{
    const removal=store.delete(prior.id);
    removal.onsuccess=()=>{removalConfirmed=true;};
   }catch{trans.abort();}
  };
  trans.oncomplete=()=>{
   database.close();
   if(removalConfirmed)resolve();
   else reject(new Error("LEGACY_DELETE_NOT_CONFIRMED"));
  };
  trans.onerror=()=>{database.close();reject(trans.error||new Error("LEGACY_DELETE_FAILED"));};
  trans.onabort=()=>{database.close();reject(new Error("LEGACY_ORDER_CHANGED_RETRY"));};
 });
}
async function legacyScopedRows(tenantId,branchId){
 const rows=await legacyAction("orders","readonly",store=>store.getAll());
 return rows.filter(row=>row?.tenantId===tenantId&&row?.branchId===branchId);
}
function legacyOrderValid(row,tenantId,branchId){
 return !!row&&typeof row==="object"&&idPattern.test(row.id)&&
  row.tenantId===tenantId&&row.branchId===branchId&&row.payload?.branchId===branchId&&
  row.payload?.requestKey===row.id&&Array.isArray(row.payload?.items)&&
  typeof row.createdAt==="string"&&Number.isFinite(Date.parse(row.createdAt))&&
  ["pending","needs_review"].includes(row.status);
}

async function importLegacyBackup(event){
 const file=event.target.files?.[0];event.target.value="";
 if(!file)return;
 if(!navigator.onLine)throw new Error("INTERNET_REQUIRED");
 if(!$("legacy-confirm").checked)throw new Error("CONFIRM_LEGACY_OWNERSHIP_FIRST");
 if(!navigator.locks?.request)throw new Error("WEB_LOCKS_REQUIRED");
 if(file.size>5000000)throw new Error("LEGACY_BACKUP_TOO_LARGE");
 const {record,key,data}=valid();
 // The historical export did not bind orders to their creator user.
 // Only a manager/owner for the current branch may import such a file.
 const check=await authorized(data.tenantId,data.branchId,data.userId);
 if(check.data.legacyRecoveryAllowed!==true)throw new Error("LEGACY_RECOVERY_MANAGER_ONLY");
 const parsed=JSON.parse(await file.text());
 if(!parsed||parsed.format!=="foon-pos-recovery-v1"||parsed.tenantId!==data.tenantId||
   parsed.branchId!==data.branchId||!Array.isArray(parsed.orders)||parsed.orders.length>500)throw new Error("INVALID_LEGACY_BACKUP");
 const rows=parsed.orders;
 if(rows.some(row=>!legacyOrderValid(row,data.tenantId,data.branchId))||
    new Set(rows.map(row=>row.id)).size!==rows.length)throw new Error("INVALID_LEGACY_BACKUP_ORDERS");
 let count=0;
 await navigator.locks.request("foon-legacy-recovery-"+data.tenantId+":"+data.branchId,{mode:"exclusive",ifAvailable:true},async granted=>{
  if(!granted)throw new Error("RECOVERY_ALREADY_RUNNING");
  // Precompute AEAD ciphertext outside the IndexedDB transaction; ensure the
  // transaction remains atomic and never awaits WebCrypto between IDB requests.
  const prepared=[];
  for(const row of rows){
   const id=record.id+"|"+row.id,prior=await get("orders",id);
   if(prior){
    const existing=await unseal(key,record.id,"order:"+row.id,prior);
    if(existing.id!==row.id||JSON.stringify(existing.payload)!==JSON.stringify(row.payload))throw new Error("LEGACY_SECURE_ORDER_CONFLICT");
    prepared.push({id,prior,newRecord:null});
   }else{
    const plaintext={id:row.id,createdAt:row.createdAt,status:row.status,
     ...(row.lastError?{lastError:row.lastError}:{}),payload:row.payload};
    const encrypted=await seal(key,record.id,"order:"+row.id,plaintext);
    // Verify encryption and scope before opening any write transaction.
    const verified=await unseal(key,record.id,"order:"+row.id,encrypted);
    if(verified.id!==row.id||JSON.stringify(verified.payload)!==JSON.stringify(row.payload))throw new Error("RECOVERY_VERIFY_FAILED");
    prepared.push({id,prior:null,newRecord:{id,profileId:record.id,orderId:row.id,createdAt:row.createdAt,...encrypted}});
   }
  }
  valid();
  const database=await db();
  count=await new Promise((resolve,reject)=>{
   const tx=database.transaction("orders","readwrite"),store=tx.objectStore("orders");
   let inserted=0;
   for(const item of prepared){
    const req=store.get(item.id);
    req.onsuccess=()=>{
     const current=req.result;
     if(item.prior){
      // Reject a simultaneous edit/removal of the prior encrypted order.
      if(JSON.stringify(current)!==JSON.stringify(item.prior)){tx.abort();return;}
     }else{
      if(current!==undefined){tx.abort();return;}
      store.add(item.newRecord);inserted++;
     }
    };
   }
   tx.oncomplete=()=>{database.close();resolve(inserted);};
   tx.onabort=()=>{database.close();reject(new Error("LEGACY_ENCRYPTED_IMPORT_CONFLICT"));};
   tx.onerror=()=>{database.close();reject(tx.error||new Error("LEGACY_IMPORT_FAILED"));};
  });
 });
 $("legacy-confirm").checked=false;
 await renderQueue();
 notice("تم استيراد "+count+" طلبات من نسخة الطوارئ القديمة وتشفيرها دون إنشاء نسخ مكشوفة. احتفظ بالملف حتى تتأكد من المزامنة، ثم احذف نسخته غير المشفرة بأمان.");
}

async function recoverLegacy(){
 const {record,key,data}=valid();
 if(!navigator.onLine)throw new Error("INTERNET_REQUIRED");
 if(!$("legacy-confirm").checked)throw new Error("CONFIRM_LEGACY_OWNERSHIP_FIRST");
 if(!navigator.locks?.request)throw new Error("WEB_LOCKS_REQUIRED");
 // These legacy rows have no creator-user binding. Recover only after the
 // server confirms THIS user is owner/manager on THIS tenant's POS branch.
 const access=await authorized(data.tenantId,data.branchId,data.userId);
 if(access.data.legacyRecoveryAllowed!==true)throw new Error("LEGACY_RECOVERY_MANAGER_ONLY");
 let count=0;
 await navigator.locks.request("foon-legacy-recovery-"+data.tenantId+":"+data.branchId,{mode:"exclusive",ifAvailable:true},async lock=>{
  if(!lock)throw new Error("RECOVERY_ALREADY_RUNNING");
  const rows=await legacyScopedRows(data.tenantId,data.branchId);
  if(rows.length>5000)throw new Error("LEGACY_QUEUE_TOO_LARGE");
  if(rows.some(row=>!legacyOrderValid(row,data.tenantId,data.branchId)))throw new Error("INVALID_LEGACY_ORDER_RETAINED");
  if(new Set(rows.map(row=>row.id)).size!==rows.length)throw new Error("DUPLICATE_LEGACY_ORDER");
  for(const row of rows){
   // Never rewrite the requestKey. It is the server's idempotency identity.
   const secureId=record.id+"|"+row.id,prior=await get("orders",secureId);
   const encryptedOrder={id:row.id,createdAt:row.createdAt,status:row.status,
    ...(row.lastError?{lastError:row.lastError}:{}),payload:row.payload};
   if(prior){
    const existing=await unseal(key,record.id,"order:"+row.id,prior);
    if(existing.id!==row.id||JSON.stringify(existing.payload)!==JSON.stringify(row.payload))throw new Error("LEGACY_SECURE_ORDER_CONFLICT");
   }else{
    const cipher=await seal(key,record.id,"order:"+row.id,encryptedOrder);
    await put("orders",{id:secureId,profileId:record.id,orderId:row.id,createdAt:row.createdAt,...cipher});
   }
   const verified=await get("orders",secureId);
   const decoded=await unseal(key,record.id,"order:"+row.id,verified);
   if(decoded.id!==row.id||JSON.stringify(decoded.payload)!==JSON.stringify(row.payload))throw new Error("RECOVERY_VERIFY_FAILED");
   // Copy, decrypt & validate first. Only then delete this precise plaintext row.
   // A crash before deletion leaves both copies; retry is idempotent.
   await legacyDeleteVerified(row);
   count++;
  }
  // The old catalog may have private commerce data. Delete only this branch's
  // stale plaintext snapshot after all scoped pending orders are recovered.
  if(!(await legacyScopedRows(data.tenantId,data.branchId)).length){
   await legacyAction("snapshots","readwrite",store=>store.delete(data.tenantId+":"+data.branchId));
  }
 });
 $("legacy-confirm").checked=false;
 await renderQueue();
 notice("نُقل "+count+" طلبات إلى التخزين المشفر بعد التحقق من حساب المدير والفرع. راجع قائمة المزامنة قبل إرسالها.");
}

function action(id,handler){$(id).addEventListener("click",()=>{Promise.resolve().then(handler).catch(error=>notice(String(error.message||error),true));});}
async function init(){
 if(!globalThis.isSecureContext||!crypto.subtle||typeof indexedDB==="undefined")throw new Error("HTTPS_WEBCRYPTO_INDEXEDDB_REQUIRED");
 $("channel").addEventListener("change",showTable);
 action("lock-btn",()=>lock());
 action("setup-btn",prepare);
 action("unlock-btn",()=>openProfile($("profiles").value,$("unlock-pass").value));
 action("save-order",saveOrder);
 action("sync-btn",sync);
 action("refresh-btn",refresh);
 action("export-btn",exportEncrypted);
 action("legacy-recover",recoverLegacy);
 $("legacy-import-file").addEventListener("change",event=>{importLegacyBackup(event).catch(error=>notice(String(error.message||error),true));});
 $("import-file").addEventListener("change",event=>{importEncrypted(event).catch(error=>notice(String(error.message||error),true));});
 if(navigator.serviceWorker&&navigator.onLine)void navigator.serviceWorker.register("/foon-offline-sw.js",{scope:"/"}).catch(()=>{});
 document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden"&&active)lock();});
 if(navigator.serviceWorker){
  navigator.serviceWorker.addEventListener("message",event=>{if(event.data?.type==="FOON_AUTH_CHANGED")lock("تغير تسجيل الدخول؛ أعد التحقق من الحساب قبل الوصول للبيانات المحلية.");});
 }
 setHidden("setup",!(idPattern.test(tenant)&&idPattern.test(branch)));
 await refreshProfiles();
 notice("جاهز. إعداد النسخة الأولى يتطلب الاتصال بالإنترنت وتسجيل الدخول في نقطة البيع.");
}
init().catch(error=>notice(String(error.message||error),true));
})();
