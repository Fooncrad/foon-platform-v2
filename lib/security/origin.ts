const SAFE_METHODS=new Set(["GET","HEAD","OPTIONS"]);

export function assertSameOrigin(request:Request){
 if(SAFE_METHODS.has(request.method.toUpperCase())) return;
 const expected=process.env.APP_URL?.trim();
 if(!expected) throw new Error("APP_URL_REQUIRED");
 const allowed=new URL(expected).origin;
 const origin=request.headers.get("origin");
 if(origin){
  if(origin!==allowed) throw new Error("CSRF_ORIGIN_REJECTED");
  return;
 }
 const referer=request.headers.get("referer");
 if(!referer) throw new Error("CSRF_ORIGIN_REQUIRED");
 let actual:string;
 try{actual=new URL(referer).origin}catch{throw new Error("CSRF_ORIGIN_REJECTED")}
 if(actual!==allowed) throw new Error("CSRF_ORIGIN_REJECTED");
}
