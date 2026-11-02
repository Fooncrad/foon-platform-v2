// Only APP_URL (server-controlled) may determine the public production redirect host.
// Never reflect request.url or forwarded host headers into production redirects.
const PRIVATE_HOSTS=new Set(["0.0.0.0","127.0.0.1","localhost","::1"]);
export const ACCOUNT_HELP_CODES=new Set([
 "GOOGLE_ACCOUNT_DISABLED","GOOGLE_EMAIL_NOT_VERIFIED","GOOGLE_STATE_INVALID",
 "GOOGLE_AUTH_FAILED","GOOGLE_AUTH_UNAVAILABLE","GOOGLE_NOT_CONFIGURED",
 "GOOGLE_DISABLED","GOOGLE_LEGAL_CONSENT_REQUIRED","LEGAL_CONSENT_REQUIRED",
 "ACCOUNT_SUSPENDED","ACCOUNT_PENDING","ACCOUNT_REJECTED","ACCOUNT_DISABLED",
 "STAFF_ACCESS_SUSPENDED","STAFF_ACCESS_PENDING","STAFF_ACCOUNT_HELP",
 "BUSINESS_SUSPENDED","BUSINESS_PENDING","EMPLOYEE_OPERATIONAL_ACCESS_ONLY",
 "TOO_MANY_ATTEMPTS","LOGIN_UNAVAILABLE","FORBIDDEN"
]);
export function accountHelpCode(code){
 return typeof code==="string"&&ACCOUNT_HELP_CODES.has(code)?code:"LOGIN_UNAVAILABLE";
}
export function publicLoginOrigin(configured,requestUrl,production=false){
 try{
  const url=new URL(configured);
  if(!url.username&&!url.password&&url.pathname==="/"&&!url.search&&!url.hash&&(
   url.protocol==="https:"&&!PRIVATE_HOSTS.has(url.hostname)||
   !production&&url.protocol==="http:"&&["localhost","127.0.0.1"].includes(url.hostname)
  ))return url.origin;
 }catch{/* Invalid APP_URL must not redirect to a private address. */}
 if(production)return "https://nfoodz.com";
 try{
  const url=new URL(requestUrl);
  if(url.protocol==="https:"&&!PRIVATE_HOSTS.has(url.hostname))return url.origin;
  if(url.protocol==="http:"&&["localhost","127.0.0.1"].includes(url.hostname))return url.origin;
  if(url.hostname==="0.0.0.0")return "http://localhost:"+url.port;
 }catch{}
 return "http://localhost:3000";
}
export function accountHelpUrl(configured,requestUrl,code,production=false){
 const target=new URL("/account-status",publicLoginOrigin(configured,requestUrl,production));
 target.searchParams.set("code",accountHelpCode(code));
 return target.toString();
}
