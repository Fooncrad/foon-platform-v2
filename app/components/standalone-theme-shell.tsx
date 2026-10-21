"use client";
import type {ReactNode} from "react";
import {useWorkspaceTheme} from "@/lib/ux/use-workspace-theme";

/** Shared theme for minimal utility routes that do not have a dashboard shell.
 * Print receipts retain a high-contrast white paper style.
 */
export default function StandaloneThemeShell({children,className=""}:{children:ReactNode;className?:string}){
 const {resolved,mode}=useWorkspaceTheme();
 return <div className={"foonStandaloneTheme "+className} data-theme={resolved} data-theme-preference={mode}>{children}</div>;
}
