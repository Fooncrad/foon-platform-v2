/** Keep the snapshot and listener on the same MediaQueryList instance.
 * This avoids missing a rapid emulated/device theme change during hydration. */
const query="(prefers-color-scheme: dark)";
let systemMedia:MediaQueryList|undefined;
function media(){
 if(typeof window==="undefined")throw new Error("System theme is client-only");
 return systemMedia??(systemMedia=window.matchMedia(query));
}
export function subscribeSystemTheme(callback:()=>void){
 const m=media();
 m.addEventListener("change",callback);
 return()=>m.removeEventListener("change",callback);
}
export const systemThemeSnapshot=()=>media().matches;
export const serverSystemThemeSnapshot=()=>false;
