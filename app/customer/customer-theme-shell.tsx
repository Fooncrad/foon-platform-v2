"use client";
import type {ReactNode} from "react";
import {useWorkspaceTheme} from "@/lib/ux/use-workspace-theme";
export default function CustomerThemeShell({children,direction}:{children:ReactNode;direction:"rtl"|"ltr"}){
 const {mode,resolved}=useWorkspaceTheme();
 return <main className="customerDashboard" dir={direction} data-theme={resolved} data-theme-preference={mode}>{children}</main>;
}
