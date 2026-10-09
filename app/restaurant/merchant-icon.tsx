import type {ReactNode} from "react";
export function MerchantIcon({name}:{name:string}){
 const paths:Record<string,ReactNode>={
  dashboard:<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  store:<><path d="M3 10V5h18v5M3 10c0 4 6 4 6 0 0 4 6 4 6 0 0 4 6 4 6 0M5 14v7h14v-7M10 21v-6h4v6"/></>,
  bag:<><rect x="4" y="7" width="16" height="14" rx="2"/><path d="M8 7V5a4 4 0 0 1 8 0v2"/></>,
  wallet:<><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M15 14h3"/></>,
  chef:<><path d="M6 13a5 5 0 0 1-1-10 5 5 0 0 1 7 0 5 5 0 0 1 7 0 5 5 0 0 1-1 10v7H6zM6 17h12"/></>,
  menu:<><path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M20 21V3c-5 0-5 11 0 11"/></>,
  table:<><rect x="3" y="5" width="18" height="9" rx="2"/><path d="M6 14v7M18 14v7"/></>,
  box:<><path d="m12 3 9 5-9 5-9-5zM3 8v9l9 5 9-5V8M12 13v9M7 5l9 5"/></>,
  users:<><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/></>,
  trend:<><path d="m3 17 6-6 4 4 8-10M15 5h6v6"/></>,
  clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  shield:<><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/></>,
  search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
  bell:<><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 21h4"/></>,
  arrow:<path d="m14 7-5 5 5 5"/>,
  plus:<path d="M12 5v14M5 12h14"/>,
 };
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]??paths.dashboard}</svg>;
}
