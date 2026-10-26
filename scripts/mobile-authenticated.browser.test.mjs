import {test,expect} from "@playwright/test";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import mysql from "mysql2/promise";

// Mutation is limited to the explicitly opted-in disposable integration DB.
// No credentials or storageState files are written to disk.
const enabled=process.env.FOON_MOBILE_SEED_FIXTURES==="1";
const origin="http://127.0.0.1:3105";
const password="synthetic-mobile-test-password";
let db,server,restaurant,grocery;
const identities={};
test.describe("disposable authenticated mobile journeys",()=>{
 test.skip(!enabled,"Set FOON_MOBILE_SEED_FIXTURES=1 with the isolated foon_migration_test DB; no production fixture writes are allowed.");
 test.beforeAll(async({browser})=>{
  test.setTimeout(120000);
  const database=new URL(process.env.DATABASE_URL||"");
  expect(database.hostname).toBe("127.0.0.1");
  expect(database.pathname).toBe("/foon_migration_test");
  db=await mysql.createConnection(database.href);
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p","3105"],{env:{...process.env,APP_URL:origin},stdio:["ignore","pipe","pipe"]});
  let output="";server.stdout.on("data",chunk=>{output=(output+chunk).slice(-4000);});server.stderr.on("data",chunk=>{output=(output+chunk).slice(-4000);});
  await expect.poll(async()=>{try{return(await fetch(origin+"/login",{signal:AbortSignal.timeout(2000)})).status;}catch{return 0;}},{timeout:45000,message:"Local mobile fixture server did not start"}).toBe(200);
  const contexts=[];
  const post=async(context,path,data,tenant)=>{
   const response=await context.request.post(origin+path,{headers:{origin,...(tenant?{"x-foon-tenant":tenant}:{})},data});
   expect(response.status(),path+" fixture setup").toBeLessThan(300);
   // next start sets Secure on session cookies even on the isolated HTTP loopback.
   // Playwright correctly refuses to resend those cookies over HTTP. Re-scope only
   // this disposable browser fixture's cookie; never change server auth policy.
   if(["/api/auth/register","/api/auth/login","/api/customer/register"].includes(path)){
    const session=(response.headers()["set-cookie"]??"").match(/(?:^|,\s*)foon_session=([^;,]+)/)?.[1];
    expect(session,path+" must issue a session cookie").toBeTruthy();
    await context.addCookies([{name:"foon_session",value:session,url:origin,httpOnly:true,secure:false,sameSite:"Lax"}]);
   }
   return response.json();
  };
  try{
   const register=async(activity)=>{
    const context=await browser.newContext();contexts.push(context);
    const slug="mobile-auth-"+activity+"-"+randomUUID().slice(0,8);
    const owner=await post(context,"/api/auth/register",{name:"Mobile fixture owner",email:slug+"@test.example",password,storeName:"Mobile "+activity,slug,activity,countryCode:"SA",currency:"SAR",region:"الرياض",legalAccepted:true});
    await db.execute("UPDATE tenant_subscriptions SET plan_id='operations-enterprise' WHERE tenant_id=?",[owner.tenant.id]);
    const [[branch]]=await db.execute("SELECT id FROM branches WHERE tenant_id=? LIMIT 1",[owner.tenant.id]);
    if(activity==="restaurant"){
     const category=await post(context,"/api/restaurant/operations/categories",{name:"Mobile category",status:"active",branchId:branch.id,data:{}},owner.tenant.id);
     await post(context,"/api/restaurant/operations/menu",{name:"Mobile restaurant item",status:"active",branchId:branch.id,data:{categoryId:category.id,price:7.25,description:"A readable mobile menu item"}},owner.tenant.id);
    }else{
     const category=await post(context,"/api/restaurant/activity-catalog",{kind:"category",name:"Mobile category"},owner.tenant.id);
     await post(context,"/api/restaurant/activity-catalog",{kind:"product",categoryId:category.id,name:"Mobile grocery item",price:7.25},owner.tenant.id);
    }
    return{...owner,slug,branch:branch.id,state:await context.storageState()};
   };
   restaurant=await register("restaurant");grocery=await register("grocery");
   identities.merchant=restaurant.state;identities.retailer=grocery.state;
   const customer=await browser.newContext();contexts.push(customer);
   const registered=await post(customer,"/api/customer/register",{name:"Mobile fixture customer",email:randomUUID()+"@test.example",password,storeSlug:restaurant.slug,legalAccepted:true});
   await db.execute("UPDATE users SET email_verified_at=UTC_TIMESTAMP() WHERE id=?",[registered.user.id]);
   identities.customer=await customer.storageState();
   for(const role of ["staff","admin"]){
    const id=randomUUID(),email=id+"@test.example";
    await db.execute("INSERT INTO users(id,email,password_hash,display_name,status,email_verified_at) SELECT ?,?,password_hash,?,'active',UTC_TIMESTAMP() FROM users WHERE id=?",[id,email,"Mobile fixture "+role,restaurant.user.id]);
    if(role==="staff"){
     await db.execute("INSERT INTO memberships(id,tenant_id,user_id,role,status) VALUES (?,?,?,'waiter','active')",[randomUUID(),restaurant.tenant.id,id]);
     await db.execute("INSERT INTO employee_branch_assignments(id,tenant_id,user_id,branch_id,role) VALUES (?,?,?,?,'waiter')",[randomUUID(),restaurant.tenant.id,id,restaurant.branch]);
     await db.execute("INSERT INTO employee_permission_grants(id,tenant_id,user_id,branch_id,permission_key,allowed) VALUES (?,?,?,?,'orders.view',TRUE)",[randomUUID(),restaurant.tenant.id,id,restaurant.branch]);
    }else await db.execute("INSERT INTO platform_admins(user_id,role,enabled) VALUES (?,'super_admin',TRUE)",[id]);
    const context=await browser.newContext();contexts.push(context);
    await post(context,"/api/auth/login",{email,password});identities[role]=await context.storageState();
   }
  }finally{await Promise.all(contexts.map(context=>context.close()));}
  // Output is retained only in memory for startup troubleshooting.
  expect(output).not.toContain("EADDRINUSE");
 });
 test.afterAll(async()=>{server?.kill();await db?.end();});

 async function inViewport(page,locator,width,height){
  await expect(locator).toBeVisible();
  const box=await locator.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(-2);expect(box.x+box.width).toBeLessThanOrEqual(width+2);
  if(height){expect(box.y).toBeGreaterThanOrEqual(-2);expect(box.y+box.height).toBeLessThanOrEqual(height+2);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+2);
 }
 for(const language of ["ar","en","fr"])for(const width of [320,375,390,430,768]){
  test(`actual protected and tenant pages ${width}px ${language}`,async({browser})=>{
   test.setTimeout(120000);
   for(const [identity,path,root] of [["merchant","/restaurant",".restaurantApp"],["merchant","/restaurant/reservations",".restaurantApp"],["staff","/restaurant",".restaurantApp"],["retailer","/grocery",".restaurantApp"],["customer","/customer",".customerDashboard"],["admin","/admin",".adminShell"],["customer","/"+restaurant.slug,".publicMenu"],["customer","/"+grocery.slug,".foonActivityStorefront"]]){
    await test.step(identity+" "+path,async()=>{
     const context=await browser.newContext({storageState:identities[identity],viewport:{width,height:640},hasTouch:true});
     try{
      await context.addCookies([{name:"foon_language",value:language,url:origin}]);
      await context.addInitScript(lang=>{localStorage.setItem("foon-language",lang);localStorage.setItem("foon-public-lang",lang);},language);
      const page=await context.newPage();const response=await page.goto(origin+path,{waitUntil:"domcontentloaded"});
      expect(response.status()).toBe(200);await expect(page).toHaveURL(origin+path);
      await expect(page.locator("html")).toHaveAttribute("lang",language);
      await expect(page.locator("html")).toHaveAttribute("dir",language==="ar"?"rtl":"ltr");
      await inViewport(page,page.locator(root),width);
      if(identity==="merchant"||identity==="staff"||identity==="retailer"){
       await expect(page.locator(root)).toHaveAttribute("data-activity",identity==="retailer"?"grocery":"restaurant");
       await expect.poll(async()=>{await page.keyboard.press("Control+k");return page.locator(".restaurantSearchDialog").count();}).toBe(1);
       await inViewport(page,page.locator(".restaurantSearchDialog"),width,640);
       await expect(page.locator(".restaurantSearchDialog input")).toBeFocused();
       await page.keyboard.press("Escape");await expect(page.locator(".restaurantSearchDialog")).toHaveCount(0);
      }
      if(path==="/restaurant/reservations"){
       const rail=page.locator(".calendarViewport");await inViewport(page,rail,width);
       await rail.focus();await expect(rail).toBeFocused();
       expect(await rail.evaluate(el=>{
        el.scrollTo({left:10000,behavior:"instant"});if(!el.scrollLeft)el.scrollTo({left:-10000,behavior:"instant"});
        return Math.abs(el.scrollLeft);
       })).toBeGreaterThan(0);
      }
      if(identity==="admin"){
       await page.locator(".adminMenuButton").click();
       await inViewport(page,page.locator(".adminDrawer"),width,640);
       await page.keyboard.press("Escape");await expect(page.locator(".adminDrawer")).toHaveCount(0);
      }
      if(root===".publicMenu"){
       const name={ar:"حجز طاولة",en:"Book a table",fr:"Réserver une table"}[language];
       await page.locator(".publicMenuInfoBar .publicMenuServices").getByRole("button",{name,exact:true}).click();
       await inViewport(page,page.locator(".publicMenuServiceDialog"),width,640);
       await page.keyboard.press("Escape");await expect(page.locator(".publicMenuServiceDialog")).not.toBeVisible();
      }
     }finally{await context.close();}
    });
   }
  });
 }
});
