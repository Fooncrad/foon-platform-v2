"use client";
export type PendingPosOrder={id:string;tenantId:string;branchId:string;createdAt:string;payload:Record<string,unknown>;status:"pending"|"needs_review";lastError?:string};
const DB_NAME="foon-pos-offline-v1",STORE="orders";
function db():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{if(typeof indexedDB==="undefined")return reject(new Error("OFFLINE_STORAGE_UNAVAILABLE"));const req=indexedDB.open(DB_NAME,2);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:"id"});if(!req.result.objectStoreNames.contains("snapshots"))req.result.createObjectStore("snapshots",{keyPath:"id"});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function transaction<T>(mode:IDBTransactionMode,fn:(store:IDBObjectStore,resolve:(value:T)=>void,reject:(reason:unknown)=>void)=>void):Promise<T>{const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction(STORE,mode);let result:T;let settled=false;tx.oncomplete=()=>{database.close();if(!settled)resolve(result);};tx.onerror=()=>{database.close();reject(tx.error);};fn(tx.objectStore(STORE),v=>{result=v;settled=false;},reject);});}
export async function queuePosOrder(order:PendingPosOrder){await transaction<void>("readwrite",(store,resolve,reject)=>{const r=store.put(order);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);});}
export async function pendingPosOrders():Promise<PendingPosOrder[]>{return transaction("readonly",(store,resolve,reject)=>{const r=store.getAll();r.onsuccess=()=>resolve((r.result as PendingPosOrder[]).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)));r.onerror=()=>reject(r.error);});}
export async function removePosOrder(id:string){await transaction<void>("readwrite",(store,resolve,reject)=>{const r=store.delete(id);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);});}
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
 }));
}
