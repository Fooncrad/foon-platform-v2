"use client";
export type PendingPosOrder={id:string;tenantId:string;branchId:string;createdAt:string;payload:Record<string,unknown>;status:"pending"|"needs_review";lastError?:string};
const DB_NAME="foon-pos-offline-v1",STORE="orders";
function db():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{if(typeof indexedDB==="undefined")return reject(new Error("OFFLINE_STORAGE_UNAVAILABLE"));const req=indexedDB.open(DB_NAME,2);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:"id"});if(!req.result.objectStoreNames.contains("snapshots"))req.result.createObjectStore("snapshots",{keyPath:"id"});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function transaction<T>(mode:IDBTransactionMode,fn:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const database=await db();
 return new Promise<T>((resolve,reject)=>{
  const tx=database.transaction(STORE,mode);
  const request=fn(tx.objectStore(STORE));
  let result:T;
  request.onsuccess=()=>{result=request.result;};
  tx.oncomplete=()=>{database.close();resolve(result);};
  tx.onerror=()=>{database.close();reject(tx.error??new Error("OFFLINE_TRANSACTION_FAILED"));};
  tx.onabort=()=>{database.close();reject(tx.error??new Error("OFFLINE_TRANSACTION_ABORTED"));};
 });
}
export async function queuePosOrder(order:PendingPosOrder):Promise<void>{
 const database=await db();
 return new Promise<void>((resolve,reject)=>{
  const tx=database.transaction(STORE,"readwrite");
  const store=tx.objectStore(STORE);
  const read=store.get(order.id);
  read.onsuccess=()=>{
   const prior=read.result as PendingPosOrder|undefined;
   if(prior&&(prior.tenantId!==order.tenantId||prior.branchId!==order.branchId||JSON.stringify(prior.payload)!==JSON.stringify(order.payload))){tx.abort();return;}
   // A retry must never downgrade a reviewed order or overwrite its diagnostic state.
   if(prior?.status==="needs_review"&&order.status==="pending")return;
   store.put(order);
  };
  tx.oncomplete=()=>{database.close();resolve();};
  tx.onerror=()=>{database.close();reject(tx.error??new Error("OFFLINE_QUEUE_FAILED"));};
  tx.onabort=()=>{database.close();reject(new Error("OFFLINE_ORDER_CONFLICT"));};
 });
}
export async function queuePosOrderIfAbsent(order:PendingPosOrder):Promise<boolean>{
 const database=await db();
 return new Promise<boolean>((resolve,reject)=>{
  const tx=database.transaction(STORE,"readwrite");
  const store=tx.objectStore(STORE);
  const get=store.get(order.id);
  let added=false;
  get.onsuccess=()=>{if(get.result===undefined){store.add(order);added=true;}else if(get.result.tenantId!==order.tenantId||get.result.branchId!==order.branchId||JSON.stringify(get.result.payload)!==JSON.stringify(order.payload)){tx.abort();}};
  tx.oncomplete=()=>{database.close();resolve(added);};
  tx.onerror=()=>{database.close();reject(tx.error??new Error("OFFLINE_QUEUE_FAILED"));};
  tx.onabort=()=>{database.close();reject(tx.error??new Error("OFFLINE_ORDER_CONFLICT"));};
 });
}
export async function pendingPosOrders():Promise<PendingPosOrder[]>{return (await transaction<PendingPosOrder[]>("readonly",store=>store.getAll())).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));}
export async function removePosOrder(id:string){await transaction<undefined>("readwrite",store=>store.delete(id));}
export async function markPosOrder(order:PendingPosOrder,error:string){await queuePosOrder({...order,status:"needs_review",lastError:error});}
export async function retryReviewedPosOrder(id:string,tenantId:string):Promise<void>{
 const database=await db();
 return new Promise<void>((resolve,reject)=>{
  const tx=database.transaction(STORE,"readwrite"),store=tx.objectStore(STORE),read=store.get(id);
  read.onsuccess=()=>{
   const order=read.result as PendingPosOrder|undefined;
   if(!order||order.tenantId!==tenantId||order.status!=="needs_review"){tx.abort();return;}
   store.put({...order,status:"pending",lastError:undefined});
  };
  tx.oncomplete=()=>{database.close();resolve();};
  tx.onabort=()=>{database.close();reject(new Error("OFFLINE_RETRY_CONFLICT"));};
  tx.onerror=()=>{database.close();reject(tx.error??new Error("OFFLINE_RETRY_FAILED"));};
 });
}
export async function exportPendingPosOrders(tenantId:string):Promise<string>{
 const rows=(await pendingPosOrders()).filter(row=>row.tenantId===tenantId);
 return JSON.stringify({format:"foon-pos-recovery-v1",exportedAt:new Date().toISOString(),tenantId:tenantId,orders:rows},null,2);
}
export async function importPendingPosOrders(json:string,tenantId:string):Promise<number>{
 const parsed:unknown=JSON.parse(json);
 if(!parsed||typeof parsed!=="object")throw new Error("INVALID_OFFLINE_BACKUP");
 const backup=parsed as {format?:unknown;tenantId?:unknown;orders?:unknown};
 if(backup.format!=="foon-pos-recovery-v1"||backup.tenantId!==tenantId||!Array.isArray(backup.orders)||backup.orders.length>5000)throw new Error("INVALID_OFFLINE_BACKUP");
 let count=0;
 for(const item of backup.orders){
  if(!item||typeof item!=="object")throw new Error("INVALID_OFFLINE_ORDER");
  const order=item as PendingPosOrder;
  if(typeof order.id!=="string"||!/^[a-f0-9-]{36}$/i.test(order.id)||order.tenantId!==tenantId||typeof order.branchId!=="string"||!order.branchId||typeof order.createdAt!=="string"||!Number.isFinite(Date.parse(order.createdAt))||!order.payload||typeof order.payload!=="object"||Array.isArray(order.payload)||order.payload.requestKey!==order.id||!["pending","needs_review"].includes(order.status))throw new Error("INVALID_OFFLINE_ORDER");
 }
 if(new Set((backup.orders as PendingPosOrder[]).map(order=>order.id)).size!==backup.orders.length)throw new Error("DUPLICATE_OFFLINE_BACKUP_ORDER");
 const database=await db();
 return new Promise<number>((resolve,reject)=>{
  const tx=database.transaction(STORE,"readwrite"),store=tx.objectStore(STORE);
  let conflict=false;
  for(const order of backup.orders as PendingPosOrder[]){
   const read=store.get(order.id);
   read.onsuccess=()=>{
    const prior=read.result as PendingPosOrder|undefined;
    if(prior&&(prior.tenantId!==order.tenantId||prior.branchId!==order.branchId||JSON.stringify(prior.payload)!==JSON.stringify(order.payload))){conflict=true;tx.abort();return;}
    if(!prior){store.add(order);count++;}
   };
  }
  tx.oncomplete=()=>{database.close();resolve(count);};
  tx.onabort=()=>{database.close();reject(new Error(conflict?"OFFLINE_ORDER_CONFLICT":"OFFLINE_TRANSACTION_ABORTED"));};
  tx.onerror=()=>{database.close();reject(conflict?new Error("OFFLINE_ORDER_CONFLICT"):tx.error??new Error("OFFLINE_TRANSACTION_FAILED"));};
 });
}

export function isNetworkFailure(error:unknown){return typeof navigator!=="undefined"&&!navigator.onLine||error instanceof TypeError&&/fetch|network|failed/i.test(error.message);}

const SNAPSHOT_STORE="snapshots";
export type PosSnapshot={currency?:string;id:string;tenantId:string;branchId:string;savedAt:string;menu:unknown[];tables:unknown[];options:Record<string,unknown>};
export async function savePosSnapshot(snapshot:PosSnapshot){await transactionStore<void>(SNAPSHOT_STORE,"readwrite",store=>store.put(snapshot));}
export async function loadPosSnapshot(tenantId:string,branchId:string):Promise<PosSnapshot|undefined>{return transactionStore<PosSnapshot|undefined>(SNAPSHOT_STORE,"readonly",store=>store.get(tenantId+":"+branchId));}
function transactionStore<T>(name:string,mode:IDBTransactionMode,operation:(store:IDBObjectStore)=>IDBRequest):Promise<T>{
 return db().then(database=>new Promise<T>((resolve,reject)=>{
  const tx=database.transaction(name,mode),request=operation(tx.objectStore(name));
  let value:T;
  request.onsuccess=()=>{value=request.result as T;};
  request.onerror=()=>reject(request.error);
  tx.oncomplete=()=>{database.close();resolve(value);};
  tx.onerror=()=>{database.close();reject(tx.error);};
  tx.onabort=()=>{database.close();reject(tx.error??new Error("OFFLINE_TRANSACTION_ABORTED"));};
 }));
}

export async function getOfflineStorageStatus(){
 if(typeof navigator==='undefined'||typeof indexedDB==='undefined')return {available:false,persistent:false,used:null as number|null,quota:null as number|null};
 const storage=navigator.storage;
 const persistent=storage?.persisted?await storage.persisted().catch(()=>false):false;
 const estimate=storage?.estimate?await storage.estimate().catch(()=>null):null;
 return {available:true,persistent,used:estimate?.usage??null,quota:estimate?.quota??null};
}

