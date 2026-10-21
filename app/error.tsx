"use client";
import SystemStatusScreen from "./system-status-screen";
export default function AppError({error,reset}:{error:Error & {digest?:string};reset:()=>void}){
 return <SystemStatusScreen status="SERVER_ERROR" error={error} reset={reset} source="app-error"/>;
}
