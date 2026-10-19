"use client";

import {useCallback,useEffect,useRef} from "react";

type Theme="light"|"dark";

export default function StorefrontThemeToggle({storageKey,language="ar",defaultTheme="light"}:{storageKey:string;language?:"ar"|"en"|"fr";defaultTheme?:Theme}){
 const buttonRef=useRef<HTMLButtonElement>(null);
 const apply=useCallback((theme:Theme)=>{
  document.querySelector<HTMLElement>("[data-color-mode]")?.setAttribute("data-color-mode",theme);
  const button=buttonRef.current;
  if(!button)return;
  button.dataset.theme=theme;
  button.setAttribute("aria-pressed",String(theme==="dark"));
  const label=theme==="dark"
   ?language==="ar"?"تفعيل الوضع النهاري":language==="fr"?"Activer le thème clair":"Switch to light mode"
   :language==="ar"?"تفعيل الوضع الليلي":language==="fr"?"Activer le thème sombre":"Switch to dark mode";
  button.setAttribute("aria-label",label);
  button.title=label;
  const icon=button.querySelector("[data-theme-icon]");
  const text=button.querySelector("[data-theme-label]");
  if(icon)icon.textContent=theme==="dark"?"☀":"☾";
  if(text)text.textContent=language==="ar"?(theme==="dark"?"نهاري":"ليلي"):language==="fr"?(theme==="dark"?"Clair":"Sombre"):(theme==="dark"?"Light":"Dark");
 },[language]);
 useEffect(()=>{
  try{
   const saved=window.localStorage.getItem(storageKey);
   if(saved==="light"||saved==="dark")apply(saved);
  }catch{/* Keep the server-selected theme if browser storage is unavailable. */}
 },[storageKey,apply]);
 function toggle(){
  const current=buttonRef.current?.dataset.theme??defaultTheme;
  const next=current==="dark"?"light":"dark";
  apply(next);
  try{window.localStorage.setItem(storageKey,next);}catch{/* The theme remains usable for this page view. */}
 }
 const label=defaultTheme==="dark"
  ?language==="ar"?"تفعيل الوضع النهاري":language==="fr"?"Activer le thème clair":"Switch to light mode"
  :language==="ar"?"تفعيل الوضع الليلي":language==="fr"?"Activer le thème sombre":"Switch to dark mode";
 return <button ref={buttonRef} type="button" className="foonStorefrontThemeToggle" data-theme={defaultTheme} onClick={toggle} aria-label={label} title={label} aria-pressed={defaultTheme==="dark"}>
  <span data-theme-icon aria-hidden="true">{defaultTheme==="dark"?"☀":"☾"}</span>
  <span data-theme-label className="foonStorefrontThemeLabel">{language==="ar"?(defaultTheme==="dark"?"نهاري":"ليلي"):language==="fr"?(defaultTheme==="dark"?"Clair":"Sombre"):(defaultTheme==="dark"?"Light":"Dark")}</span>
 </button>;
}
