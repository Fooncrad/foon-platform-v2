"use client";
import type {ReactNode} from "react";
import {useSavedPreference} from "@/lib/ui/saved-preference";
import "./media-studio.css";

export default function MediaStudioTheme({children}:{children:ReactNode}){
 const [theme]=useSavedPreference<"light"|"dark">("foon-admin-theme",["light","dark"],"light",true);
 return <div className="foonMediaStudio" data-theme={theme}>{children}</div>;
}
