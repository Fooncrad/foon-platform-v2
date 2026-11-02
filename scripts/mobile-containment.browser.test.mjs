import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";

// Isolated rendering of production styles: no server, accounts or database.
// These exercise layout contracts, not authenticated business journeys.
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const css=["app/globals.css","app/restaurant/dining.css","app/[slug]/public-menu.css",
 "app/[slug]/unified-storefront-ux.css","app/site-wide-responsive-polish.css",
 "app/mobile-viewport-stability.css"].map(read).join("\n");
for(const language of ["ar","en","fr"])for(const width of [320,375,390,430,768]){
 test(`internal rails and short-screen dialogs ${width}px ${language}`,async({page})=>{
  await page.setViewportSize({width,height:480});
  const copy={ar:"تفاصيل الحجز والطاولات",en:"Reservation and table details",fr:"Détails de la réservation et des tables"}[language];
  await page.setContent(`<html lang="${language}" dir="${language==="ar"?"rtl":"ltr"}"><head><style>${css}</style></head><body>
   <main class="restaurantApp" style="display:block;padding:12px"><section class="restaurantContent">
    <div class="calendarViewport" tabindex="0" role="region" aria-label="calendar"><div class="calendarGrid calendarGrid-month">${Array.from({length:7},(_,i)=>`<section><header><button>${i+1}</button></header><button class="calendarEvent"><b>${copy}</b><strong>18:00</strong></button></section>`).join("")}</div></div>
    <div class="restaurantTableWrap" tabindex="0"><table style="width:1000px"><tr><td>${copy}</td><td>End</td></tr></table></div>
   </section></main>
   ${[["adminShell","adminDataTableWrap"],["customerDashboard","adminOpsTableWrap"],["foonActivityStorefront","foonActivityCategories"]].map(([shell,rail])=>`<main class="${shell}" style="display:block;padding:12px"><section class="foonActivityCategoryRail"><div class="${rail}" tabindex="0"><div style="width:1000px;min-width:1000px">${copy}</div></div></section></main>`).join("")}
   </body></html>`);
  for(const selector of [".calendarViewport",".restaurantTableWrap",".adminDataTableWrap",".adminOpsTableWrap",".foonActivityCategories"]){
   const rail=page.locator(selector);
   const result=await rail.evaluate(el=>{
    const box=el.getBoundingClientRect();el.scrollTo({left:10000,behavior:"instant"});
    if(!el.scrollLeft)el.scrollTo({left:-10000,behavior:"instant"});
    return {left:box.left,right:box.right,wide:el.scrollWidth>el.clientWidth,moved:Math.abs(el.scrollLeft)};
   });
   expect(result.left).toBeGreaterThanOrEqual(0);expect(result.right).toBeLessThanOrEqual(width);
   expect(result.wide,selector).toBe(true);expect(result.moved,selector).toBeGreaterThan(0);
  }
  if(width<768)await expect(page.locator(".calendarEvent b").first()).toBeVisible();
  for(const cls of ["publicMenuServiceDialog","foonActivityProductDialog","calendarEditor","foonConfirmDialog"]){
   await page.evaluate(({cls,copy})=>{
    const dialog=document.createElement("dialog");dialog.className=cls;
    dialog.innerHTML=`<h2>${copy}</h2><p>${"LongIdentifier".repeat(50)}</p><div style="height:900px"></div><button>Close</button>`;
    dialog.querySelector("button").onclick=()=>dialog.close();document.body.append(dialog);dialog.showModal();
   },{cls,copy});
   const dialog=page.locator(`dialog.${cls}`);
   const box=await dialog.boundingBox();
   expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
   expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(480);
   expect(await dialog.evaluate(el=>{el.scrollTop=10000;return el.scrollTop;})).toBeGreaterThan(0);
   await dialog.getByRole("button",{name:"Close"}).click();
   await expect(dialog).not.toBeVisible();await dialog.evaluate(el=>el.remove());
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 });
}
