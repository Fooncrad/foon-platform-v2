"use client";
import {useSyncExternalStore} from "react";
import {useSavedPreference} from "@/lib/ui/saved-preference";
import {WORKSPACE_THEME_KEY,WORKSPACE_THEME_MODES,resolveWorkspaceTheme,type WorkspaceThemeMode} from "./workspace-theme";
import {subscribeSystemTheme,systemThemeSnapshot,serverSystemThemeSnapshot} from "./system-theme-store";
export function useWorkspaceTheme(){
 const [mode,setMode]=useSavedPreference<WorkspaceThemeMode>(WORKSPACE_THEME_KEY,WORKSPACE_THEME_MODES,"system");
 const prefersDark=useSyncExternalStore(subscribeSystemTheme,systemThemeSnapshot,serverSystemThemeSnapshot);
 return {mode,resolved:resolveWorkspaceTheme(mode,prefersDark),setMode};
}
