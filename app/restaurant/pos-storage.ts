import type {MenuGroup} from '@/lib/restaurant/menu';
import type {CartLine} from './menu-choices';
import {useMemo,useSyncExternalStore} from 'react';
const memory=new Map<string,string>();
export const subscribePosStorage=(update:()=>void)=>{const external=(e:StorageEvent)=>{if(e.key?.endsWith(':cart'))memory.delete(e.key.slice(0,-5));update()};addEventListener('storage',external);addEventListener('foon-pos-storage',update);return()=>{removeEventListener('storage',external);removeEventListener('foon-pos-storage',update)}};
export type PosItem={id:string;name:string;status:string;data:{price:number;categoryId?:string;imageUrl?:string}};
export type PosTable={id:string;name:string;status:string;data:{capacity:number;sectionId?:string}};
export type PosSnapshot={actorId:string;tenantId:string;name:string;branch:string;branches:{id:string;name:string}[];menu:PosItem[];tables:PosTable[];options:Record<string,MenuGroup[]>;categories:{id:string;name:string}[];savedAt:string};
export const posPrefix='foon:pos:v1:';
export const posKey=(actor:string,tenant:string,branch:string)=>posPrefix+actor+':'+tenant+':'+branch;
export function readSnapshot(key:string):PosSnapshot|null{try{const data=JSON.parse(localStorage.getItem(key+':catalog')||'null');return data&&Array.isArray(data.menu)&&Array.isArray(data.branches)&&data.savedAt?data:null}catch{return null}}
export function saveSnapshot(key:string,snapshot:PosSnapshot){try{localStorage.setItem(key+':catalog',JSON.stringify(snapshot));dispatchEvent(new Event('foon-pos-storage'));return true}catch{return false}}
function parseCart(encoded:string):Record<string,CartLine>{try{const data=JSON.parse(encoded);return Object.fromEntries(Object.entries(data).filter(([,line])=>{const v=line as CartLine;return v&&typeof v.itemId==='string'&&Number.isInteger(v.quantity)&&v.quantity>0&&v.quantity<=1000&&Array.isArray(v.options)&&v.options.every(id=>typeof id==='string')})) as Record<string,CartLine>}catch{return {}}}
export function saveCart(key:string,cart:Record<string,CartLine>){const data=JSON.stringify(cart);memory.set(key,data);let saved=true;try{localStorage.setItem(key+':cart',data)}catch{saved=false}dispatchEvent(new Event('foon-pos-storage'));return saved}
export function usePosCart(key:string):[Record<string,CartLine>,(next:Record<string,CartLine>|((previous:Record<string,CartLine>)=>Record<string,CartLine>))=>boolean]{const encoded=useSyncExternalStore(subscribePosStorage,()=>{try{return memory.get(key)||localStorage.getItem(key+':cart')||'{}'}catch{return memory.get(key)||'{}'}},()=> '{}'),cart=useMemo(()=>parseCart(encoded),[encoded]);return[cart,next=>saveCart(key,typeof next==='function'?next(cart):next)]}
export function savedCatalogs(){try{return JSON.stringify(Object.keys(localStorage).filter(k=>k.startsWith(posPrefix)&&k.endsWith(':catalog')).map(k=>readSnapshot(k.slice(0,-8))).filter(Boolean).sort((a,b)=>b!.savedAt.localeCompare(a!.savedAt)))}catch{return '[]'}}
export function clearPosStorage(){memory.clear();try{for(const key of Object.keys(localStorage))if(key.startsWith(posPrefix))localStorage.removeItem(key);dispatchEvent(new Event('foon-pos-storage'))}catch{}}
