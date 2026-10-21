"use client";
import SystemStatusScreen from "@/app/system-status-screen";
export default function TranslationsError({error,reset}:{error:Error & {digest?:string};reset:()=>void}){
 return <SystemStatusScreen status="SERVER_ERROR" error={error} reset={reset} source="app-error"/>;
}
