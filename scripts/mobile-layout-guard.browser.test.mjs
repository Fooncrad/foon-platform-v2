import {test,expect} from "@playwright/test";

// Read-only browser regression suite; run after a local production build.
// Example: FOON_MOBILE_BASE_URL=http://127.0.0.1:3000 npm run test:mobile-layout
const origin=(process.env.FOON_MOBILE_BASE_URL||"http://127.0.0.1:3000").replace(/\/$/,"");
const routes=["/","/login","/register","/market"];
if(process.env.FOON_MOBILE_STORE_SLUG)routes.push("/menu/"+encodeURIComponent(process.env.FOON_MOBILE_STORE_SLUG));
const widths=[320,375,390,430,768];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

for(const width of widths){
 test(`mobile layout stays in viewport at ${width}px`,async({browser})=>{
  const context=await browser.newContext({viewport:{width,height:780},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  try{
   for(const route of routes){
    const response=await page.goto(origin+route,{waitUntil:"domcontentloaded",timeout:30000});
    expect(response?.status(),route+" must respond").toBeLessThan(500);
    await page.locator("body").waitFor({state:"visible"});
    await sleep(150);
    const result=await page.evaluate(()=>{
     const screen=document.documentElement.clientWidth;
     const all=[...document.querySelectorAll("body *")];
     const bad=[];
     for(const el of all){
      const style=getComputedStyle(el);
      if(style.display==="none"||style.visibility==="hidden"||style.position==="fixed"||style.position==="absolute")continue;
      if(el.closest('[aria-hidden="true"],[hidden]'))continue;
      const box=el.getBoundingClientRect();
      if(!box.width||!box.height)continue;
      if(box.width>screen+2 && style.overflowX!=="auto"&&style.overflowX!=="scroll"&&bad.length<12){
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
