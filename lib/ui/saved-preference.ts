"use client";
import {useCallback,useSyncExternalStore} from "react";
const event="foon-preference-change";
function subscribe(callback:()=>void){window.addEventListener("storage",callback);window.addEventListener(event,callback);const media=window.matchMedia("(prefers-color-scheme: dark)");media.addEventListener("change",callback);return()=>{window.removeEventListener("storage",callback);window.removeEventListener(event,callback);media.removeEventListener("change",callback);};}
export function useSavedPreference<T extends string>(key:string,allowed:readonly T[],fallback:T,systemTheme=false):[T,(value:T)=>void]{
 const read=()=>{let value:string|null=null;try{value=localStorage.getItem(key);}catch{}return value&&allowed.includes(value as T)?value as T:systemTheme&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark" as T:fallback;};
 const value=useSyncExternalStore(subscribe,read,()=>fallback);
 const set=useCallback((next:T)=>{try{localStorage.setItem(key,next);}catch{}window.dispatchEvent(new Event(event));},[key]);
 return [value,set];
}
