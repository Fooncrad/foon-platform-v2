"use client";
import {useWorkspaceTheme} from "@/lib/ux/use-workspace-theme";
import {WORKSPACE_THEME_LABELS,type WorkspaceThemeLanguage,type WorkspaceThemeMode} from "@/lib/ux/workspace-theme";
export default function WorkspaceThemeControl({language,className=""}:{language:WorkspaceThemeLanguage;className?:string}){
 const {mode,setMode}=useWorkspaceTheme(),labels=WORKSPACE_THEME_LABELS[language];
 return <label className={"foonWorkspaceThemeControl "+className}>
  <span>{labels.label}</span>
  <select aria-label={labels.label} value={mode} onChange={event=>setMode(event.target.value as WorkspaceThemeMode)}>
   <option value="system">{labels.system}</option>
   <option value="light">{labels.light}</option>
   <option value="dark">{labels.dark}</option>
  </select>
 </label>;
}
