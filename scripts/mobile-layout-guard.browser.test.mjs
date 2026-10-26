import {test,expect} from "@playwright/test";
import {spawn} from "node:child_process";

// Read-only browser regression suite; run after a local production build.
// Example: FOON_MOBILE_BASE_URL=http://127.0.0.1:3000 npm run test:mobile-layout
const managedServer=!process.env.FOON_MOBILE_BASE_URL;
const origin=(process.env.FOON_MOBILE_BASE_URL||"http://127.0.0.1:3103").replace(/\/$/,"");
let server;
test.beforeAll(async()=>{
 if(!managedServer)return;
 server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p","3103"],{env:{...process.env,APP_URL:origin},stdio:"ignore"});
 for(let i=0;i<60;i++){
  try{const response=await fetch(origin+"/login");if(response.status<500)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 throw Error("Mobile layout test server did not start on port 3103");
});
test.afterAll(()=>server?.kill());
const routes=["/","/login","/register","/market"];
if(process.env.FOON_MOBILE_STORE_SLUG)routes.push("/"+encodeURIComponent(process.env.FOON_MOBILE_STORE_SLUG));
const widths=[320,375,390,430,768];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// Supply disposable authenticated sessions, never weaken route authorization.
// JSON: [{name,path,root,storageState}] for customer, staff, merchant and admin.
const protectedSurfaces=JSON.parse(process.env.FOON_MOBILE_AUTH_SURFACES||"[]");
test("authenticated mobile coverage is explicitly configured",()=>{
 test.skip(!protectedSurfaces.length,"No disposable authenticated sessions supplied; protected routes are NOT covered by public login redirects.");
 expect(protectedSurfaces.map(surface=>surface.name).sort()).toEqual(["admin","customer","merchant","staff"]);
});

for(const language of ["ar","en","fr"])for(const width of widths){
 test(`mobile layout stays in viewport at ${width}px (${language})`,async({browser})=>{
  test.setTimeout(120000);
  const context=await browser.newContext({viewport:{width,height:780},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await context.addCookies([{name:"foon_language",value:language,url:origin}]);
  await context.addInitScript(lang=>{localStorage.setItem("foon-language",lang);localStorage.setItem("foon-public-lang",lang);},language);
  const page=await context.newPage();
  try{
   for(const route of routes){
    const response=await page.goto(origin+route,{waitUntil:"domcontentloaded",timeout:30000});
    expect(response?.status(),route+" must respond successfully").toBeLessThan(400);
    await expect(page.locator("html")).toHaveAttribute("lang",language);
    await expect(page.locator("html")).toHaveAttribute("dir",language==="ar"?"rtl":"ltr");
    await page.locator("body").waitFor({state:"visible"});
    await sleep(150);
    const result=await page.evaluate(()=>{
     const screen=document.documentElement.clientWidth;
     const all=[...document.querySelectorAll("body *")];
     const bad=[];
     for(const el of all){
      const style=getComputedStyle(el);
      if(style.display==="none"||style.visibility==="hidden")continue;
      if(el.closest('[aria-hidden="true"],[hidden]'))continue;
      const box=el.getBoundingClientRect();
      if(!box.width||!box.height)continue;
      const scrollParent=[...function*(node){for(let parent=node.parentElement;parent;parent=parent.parentElement)yield parent;} (el)].some(parent=>{const s=getComputedStyle(parent);return (s.overflowX==="auto"||s.overflowX==="scroll")&&parent.scrollWidth>parent.clientWidth;});
      if((box.width>screen+2||box.left < -2||box.right>screen+2) && !scrollParent && style.overflowX!=="auto"&&style.overflowX!=="scroll"&&bad.length<12){
       bad.push({tag:el.tagName,cls:String(el.className).slice(0,90),width:Math.round(box.width),screen});
      }
     }
     return {client:screen,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,bad};
    });
    expect(result.document,route+" page overflow: "+JSON.stringify(result)).toBeLessThanOrEqual(result.client+2);
    expect(result.bad,route+" oversized elements").toEqual([]);
   }
  }finally{await context.close();}
 });
}

for(const surface of protectedSurfaces)for(const language of ["ar","en","fr"])for(const width of widths){
 test(`${surface.name} authenticated ${width}px ${language}`,async({browser})=>{
  expect(surface.path).toMatch(/^\/(?!\/)/);
  const context=await browser.newContext({storageState:surface.storageState,viewport:{width,height:640},hasTouch:true});
  try{
   await context.addCookies([{name:"foon_language",value:language,url:origin}]);
   await context.addInitScript(lang=>{localStorage.setItem("foon-language",lang);localStorage.setItem("foon-public-lang",lang);},language);
   const page=await context.newPage();
   const response=await page.goto(origin+surface.path);
   expect(response.status()).toBeLessThan(400);
   expect(new URL(page.url()).pathname).toBe(new URL(surface.path,origin).pathname);
   await expect(page.locator(surface.root)).toBeVisible();
   await expect(page.locator("html")).toHaveAttribute("lang",language);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+2);
   const shell=await page.locator(surface.root).boundingBox();
   expect(shell.x).toBeGreaterThanOrEqual(-2);expect(shell.x+shell.width).toBeLessThanOrEqual(width+2);
  }finally{await context.close();}
 });
}
test("auth inputs remain tappable without iOS focus zoom",async({browser})=>{
 const context=await browser.newContext({viewport:{width:375,height:720},isMobile:true,hasTouch:true});
 try{
  const page=await context.newPage();
  await page.goto(origin+"/login");
  const email=page.locator('input[type="email"]').first();
  await expect(email).toBeVisible();
  const size=await email.evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
  const rect=await email.boundingBox();
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x+rect.width).toBeLessThanOrEqual(377);
 }finally{await context.close();}
});
