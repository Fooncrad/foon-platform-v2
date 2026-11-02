"use client";
import {useRouter} from 'next/navigation';
import {createContext,useContext,useEffect,useState,useCallback} from 'react';
import {uiText,type UiLanguage} from './ui-copy';
const Context=createContext<UiLanguage>('ar');
export function UiLanguageProvider({language,children}:{language:UiLanguage;children:React.ReactNode}){
 const [selected,setSelected]=useState(language);
 useEffect(()=>{const update=()=>{const value=document.documentElement.lang;setSelected(value==='en'||value==='fr'?value:'ar');};update();window.addEventListener('foon:language-change',update);return()=>window.removeEventListener('foon:language-change',update);},[language]);
 return <Context.Provider value={selected}>{children}</Context.Provider>;
}
export function useUiLanguage(){return useContext(Context);}
export function useUiText(){const language=useContext(Context);return useCallback((value:string)=>uiText(value,language),[language]);}

export function setUiLanguage(language:UiLanguage){
 document.cookie="foon_language="+language+"; Path=/; Max-Age=31536000; SameSite=Lax";
 try{localStorage.setItem("foon-language",language);localStorage.setItem("foon-public-lang",language);}catch{}
 document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';
 window.dispatchEvent(new CustomEvent('foon:language-change',{detail:{language}}));
 void fetch('/api/account/language',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({language})}).catch(()=>{});
}
export function useLanguagePreference():[UiLanguage,(language:UiLanguage)=>void]{
 const language=useUiLanguage(),router=useRouter();
 const change=useCallback((next:UiLanguage)=>{setUiLanguage(next);router.refresh();},[router]);
 return [language,change];
}
