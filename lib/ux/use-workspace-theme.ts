"use client";
import {useSyncExternalStore} from "react";
import {useSavedPreference} from "@/lib/ui/saved-preference";
import {WORKSPACE_THEME_KEY,WORKSPACE_THEME_MODES,resolveWorkspaceTheme,type WorkspaceThemeMode} from "./workspace-theme";
const query="(prefers-color-scheme: dark)";
function subscribeSystem(callback:()=>void){
 const media=window.matchMedia(query);
 media.addEventListener("change",callback);
 return()=>media.removeEventListener("change",callback);
}
const systemSnapshot=()=>window.matchMedia(query).matches;
export function useWorkspaceTheme(){
 const [mode,setMode]=useSavedPreference<WorkspaceThemeMode>(WORKSPACE_THEME_KEY,WORKSPACE_THEME_MODES,"system");
 const prefersDark=useSyncExternalStore(subscribeSystem,systemSnapshot,()=>false);
 return {mode,resolved:resolveWorkspaceTheme(mode,prefersDark),setMode};
}
