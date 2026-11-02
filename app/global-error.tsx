"use client";
import SystemStatusScreen from "./system-status-screen";
export default function GlobalError({error,reset}:{error:Error & {digest?:string};reset:()=>void}){
 return <html lang="ar"><body style={{margin:0}}><SystemStatusScreen status="SERVER_ERROR" error={error} reset={reset} source="global-error"/></body></html>;
}
