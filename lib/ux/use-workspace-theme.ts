"use client";
import {useSyncExternalStore} from "react";
import {useSavedPreference} from "@/lib/ui/saved-preference";
import {WORKSPACE_THEME_KEY,WORKSPACE_THEME_MODES,resolveWorkspaceTheme,type WorkspaceThemeMode} from "./workspace-theme";
const query="(prefers-color-scheme: dark)";
function subscribeSystem(callback:()=>void){
 const media=window.matchMedia(query);
 let last=media.matches;
 const reconcile=()=>{
  const current=window.matchMedia(query).matches;
  if(current===last)return;
  last=current;
  callback();
 };
 media.addEventListener("change",reconcile);
 window.addEventListener("focus",reconcile);
 // Some embedded/headless browsers miss the native dark-to-light event.
 // Reconcile the actual media value without causing a React update if unchanged.
 const poll=window.setInterval(reconcile,1000);
 return()=>{
  media.removeEventListener("change",reconcile);
  window.removeEventListener("focus",reconcile);
  window.clearInterval(poll);
 };
}
const systemSnapshot=()=>window.matchMedia(query).matches;
export function useWorkspaceTheme(){
 const [mode,setMode]=useSavedPreference<WorkspaceThemeMode>(WORKSPACE_THEME_KEY,WORKSPACE_THEME_MODES,"system");
 const prefersDark=useSyncExternalStore(subscribeSystem,systemSnapshot,()=>false);
 return {mode,resolved:resolveWorkspaceTheme(mode,prefersDark),setMode};
}
