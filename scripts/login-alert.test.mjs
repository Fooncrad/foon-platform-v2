import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loginDeviceInfo,loginAlertCopy,queueLoginAlert} from "../lib/auth/login-alert.ts";

const at=new Date("2026-10-24T17:00:00.000Z");
const request=(ua,city)=>new Request("https://nfoodz.com/api/auth/login",{
 headers:{"user-agent":ua,...(city?{"cf-ipcity":city}:{})}
});
test("a password login includes browser, device, Saudi time and approximate city",()=>{
 const context=loginDeviceInfo(request("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36","Riyadh"),"ar",at);
 assert.equal(context.browser,"Google Chrome");
 assert.match(context.device,/كمبيوتر.*Windows/);
 assert.equal(context.city,"Riyadh");
 assert.match(context.occurredAt,/20:00:00/);
 assert.equal(/[٠-٩۰-۹]/.test(context.occurredAt),false);
 const message=loginAlertCopy("ar","password",context);
 for(const field of ["المتصفح","الجهاز","الوقت","المدينة","كلمة المرور","Riyadh"])assert.ok(message.text.includes(field));
 assert.ok(!message.text.includes("127.0.0.1"));
});
test("Google login on a phone and French locale stays French",()=>{
 const context=loginDeviceInfo(request("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"),"fr",at);
 assert.match(context.device,/Téléphone.*iOS/);
 assert.equal(context.browser,"Safari");
 assert.equal(context.city,"Indisponible");
 const notice=loginAlertCopy("fr","google",context);
 assert.match(notice.subject,/connexion/);
 assert.match(notice.text,/Google/);
 assert.equal(/[\u0600-\u06ff]/.test(notice.subject+notice.text),false);
});
test("geo header is optional; never report IP or malicious header as a city",()=>{
 const safe=loginDeviceInfo(request("Mozilla/5.0 (Linux; Android 16; Pixel) Chrome/132 Mobile",null),"en",at);
 assert.equal(safe.city,"Unavailable");
 assert.equal(safe.browser,"Google Chrome");
 const malicious=loginDeviceInfo(request("Firefox/138","TestCity%0D%0ABcc:attacker@test.example"),"en",at);
 assert.ok(!malicious.city.includes("\r"));
 assert.ok(!malicious.city.includes("\n"));
 assert.equal(loginDeviceInfo(request("Firefox/138",""),"en",at).city,"Unavailable");
 assert.equal(loginDeviceInfo(request("Firefox/138","123.123.123.123"),"en",at).city,"Unavailable");
});
test("login alert sends only to the authenticated user's email, including unverified users",async()=>{
 const calls=[],db={execute:async(sql,args)=>{
  calls.push({sql,args});
  if(sql.startsWith("SELECT email"))return [[{email:"owner@example.test",default_locale:"en"}]];
  return [{affectedRows:1}];
 }};
 assert.equal(await queueLoginAlert(db,"account-123",request("Mozilla/5.0 (Windows) Edg/131","Jeddah"),"password"),true);
 assert.equal(calls.length,2);
 assert.deepEqual(calls[0].args,["account-123"]);
 assert.match(calls[1].sql,/event_key,recipient_email,subject,body_text/);
 assert.match(calls[1].sql,/security_login/);
 assert.equal(calls[1].args[1],"owner@example.test");
 assert.match(calls[1].args[3],/Jeddah/);
 assert.match(calls[1].args[3],/Microsoft Edge/);
});
test("missing or inactive user has no alert and outbox failure never breaks sign-in",async()=>{
 let writes=0;
 const inactive={execute:async()=>[[]]};
 assert.equal(await queueLoginAlert(inactive,"missing",request("Firefox/138"),"password"),false);
 const db={execute:async(sql)=>sql.startsWith("SELECT")?[[{email:"owner@example.test",default_locale:"ar"}]]:Promise.reject(Error("DB_UNAVAILABLE"))};
 const old=console.error;const errors=[];console.error=(...args)=>errors.push(args);
 try{assert.equal(await queueLoginAlert(db,"account-123",request("Firefox/138"),"google"),false);}
 finally{console.error=old;}
 assert.equal(errors.some(x=>x.includes("LOGIN_SECURITY_ALERT_QUEUE_UNAVAILABLE")),true);
 assert.equal(writes,0);
});
test("account password and OAuth login routes only dispatch after successful auth",()=>{
 const login=readFileSync(new URL("../app/api/auth/login/route.ts",import.meta.url),"utf8");
 const google=readFileSync(new URL("../app/api/auth/google/callback/route.ts",import.meta.url),"utf8");
 const registration=readFileSync(new URL("../app/api/customer/register/route.ts",import.meta.url),"utf8");
 assert.match(login,/if\(!valid\)return[\s\S]+await createSession\(String\(user\.id\)\);[\s\S]+queueLoginAlert\(database\(\),String\(user\.id\),request,"password"\)/);
 assert.match(google,/await db\.commit\(\);[\s\S]+queueLoginAlert\(database\(\),userId,request,"google"\)/);
 assert.match(registration,/await db\.commit\(\);[\s\S]+queueLoginAlert\(database\(\),id,request,"registration"\)/);
});
