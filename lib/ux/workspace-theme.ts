/** Account workspace UI preference, separate from tenant storefront brand appearance. */
export const WORKSPACE_THEME_KEY="foon-workspace-theme";
export const WORKSPACE_THEME_MODES=["system","light","dark"] as const;
export type WorkspaceThemeMode=typeof WORKSPACE_THEME_MODES[number];
export type WorkspaceThemeResolved="light"|"dark";
export type WorkspaceThemeLanguage="ar"|"en"|"fr";
export const WORKSPACE_THEME_LABELS:Record<WorkspaceThemeLanguage,{label:string;system:string;light:string;dark:string}>={
 ar:{label:"المظهر",system:"حسب الجهاز",light:"فاتح",dark:"داكن"},
 en:{label:"Appearance",system:"Use device",light:"Light",dark:"Dark"},
 fr:{label:"Apparence",system:"Selon l’appareil",light:"Clair",dark:"Sombre"}
};
export function resolveWorkspaceTheme(mode:WorkspaceThemeMode,systemDark:boolean):WorkspaceThemeResolved{
 return mode==="system"?(systemDark?"dark":"light"):mode;
}
export function isWorkspaceTheme(value:unknown):value is WorkspaceThemeMode{
 return typeof value==="string"&&WORKSPACE_THEME_MODES.includes(value as WorkspaceThemeMode);
}
