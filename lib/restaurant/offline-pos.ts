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
export async function queuePosOrder(order:PendingPosOrder){await transaction<IDBValidKey>("readwrite",store=>store.put(order));}
export async function pendingPosOrders():Promise<PendingPosOrder[]>{return (await transaction<PendingPosOrder[]>("readonly",store=>store.getAll())).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));}
export async function removePosOrder(id:string){await transaction<undefined>("readwrite",store=>store.delete(id));}
export async function markPosOrder(order:PendingPosOrder,error:string){await queuePosOrder({...order,status:"needs_review",lastError:error});}
export function isNetworkFailure(error:unknown){return typeof navigator!=="undefined"&&!navigator.onLine||error instanceof TypeError&&/fetch|network|failed/i.test(error.message);}

const SNAPSHOT_STORE="snapshots";
export type PosSnapshot={id:string;tenantId:string;branchId:string;savedAt:string;menu:unknown[];tables:unknown[];options:Record<string,unknown>};
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
