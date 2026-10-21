import type {NextRequest} from "next/server";
import {NextResponse} from "next/server";

/**
 * Optional planned-maintenance gate. This cannot handle nginx 504 if Node.js
 * itself is down: configure nginx/CDN to serve public/maintenance.html directly.
 * API routes (including payment webhooks) are intentionally not intercepted.
 */
export function proxy(request:NextRequest){
 if(process.env.FOON_MAINTENANCE_MODE!=="1")return NextResponse.next();
 if(!["GET","HEAD"].includes(request.method))return NextResponse.next();
 const pathname=request.nextUrl.pathname;
 if(pathname==="/maintenance"||pathname==="/maintenance.html"||pathname.startsWith("/api/")||pathname.startsWith("/_next/")||pathname.startsWith("/foon-offline-"))return NextResponse.next();
 const language=(request.cookies.get("foon_language")?.value??"ar").toLowerCase();
 const locale=language==="en"||language==="fr"?language:"ar";
 const copy={
  ar:["نقوم بتحديث المنصة","الخدمة تحت الصيانة مؤقتًا. حاول مجددًا بعد قليل.","إعادة المحاولة","رمز الحالة: 503"],
  en:["We are updating the platform","Service is temporarily under maintenance. Please try again shortly.","Try again","HTTP status: 503"],
  fr:["Nous mettons la plateforme à jour","Service temporairement en maintenance. Veuillez réessayer plus tard.","Réessayer","Code HTTP : 503"]
 }[locale];
 const html='<!doctype html><html lang="'+locale+'" dir="'+(locale==="ar"?"rtl":"ltr")+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>FOON — Maintenance</title><style>body{min-height:100svh;margin:0;display:grid;place-items:center;background:#171613;color:#f8f3e9;font:16px/1.8 system-ui,Tahoma,Arial;padding:20px;box-sizing:border-box}main{width:min(100%,600px);background:#24221e;padding:clamp(24px,6vw,52px);border:1px solid #554733;border-radius:20px;text-align:center}b{font-size:32px;color:#e2a93b}p{color:#d5cdc2}a{display:inline-block;background:#e2a93b;color:#171613;padding:12px 22px;border-radius:10px;font-weight:800;text-decoration:none}</style></head><body><main><b>FOON</b><h1>'+copy[0]+'</h1><p>'+copy[1]+'</p><a href="/">'+copy[2]+'</a><p>'+copy[3]+' · MAINT-503</p><p><a style="background:transparent;color:#e2a93b;padding:6px" href="/maintenance">العربية / EN / FR</a></p></main></body></html>';
 return new NextResponse(request.method==="HEAD"?null:html,{status:503,headers:{"Content-Type":"text/html; charset=utf-8","Retry-After":"300","Cache-Control":"no-store","X-Robots-Tag":"noindex","Content-Language":locale}});
}
export const config={matcher:["/((?!api/|_next/|maintenance(?:/|$)|favicon.ico|robots.txt|sitemap.xml|foon-offline-).*)"]};
