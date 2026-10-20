import {test,expect} from "@playwright/test";
import {spawn} from "node:child_process";
import mysql from "mysql2/promise";
import sharp from "sharp";
import {randomUUID,createHash} from "node:crypto";
// Screenshot artifacts are optional; all functional and layout assertions still run.
// Default behavior retains visual captures. Set FOON_BROWSER_SCREENSHOTS=0 only
// when the local browser cannot capture images; report visual QA separately.
async function captureScreenshot(target,options){
 if(process.env.FOON_BROWSER_SCREENSHOTS==="0")return;
 await target.screenshot(options);
}
test.use({actionTimeout:15000,navigationTimeout:30000});
let server;
const origin="http://localhost:3102";
test.beforeAll(async()=>{
 const url=new URL(process.env.DATABASE_URL||"");expect(url.hostname).toBe("127.0.0.1");expect(url.pathname).toBe("/foon_migration_test");
 server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p","3102"],{env:{...process.env,APP_URL:origin},stdio:"ignore"});
 for(let i=0;i<60;i++){try{await fetch(origin+"/login");return;}catch{await new Promise(resolve=>setTimeout(resolve,500));}}
 throw Error("Test server did not start");
});
test.afterAll(()=>server?.kill());
test("reference dashboard: authenticated tenant data, responsive layout and working navigation",async({page,browser})=>{
 const visualSlug="visual-dashboard-"+randomUUID().slice(0,8);
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(origin+"/register");
 await page.getByLabel("الاسم",{exact:true}).fill("مالك المعاينة");
 await page.getByLabel("اسم النشاط",{exact:true}).fill("مطعم المعاينة");
 await page.locator('select[name="activity"]').selectOption("restaurant");
 await page.getByRole("button",{name:"التالي: بيانات الحساب",exact:true}).click();
 await page.getByLabel("رابط المتجر",{exact:true}).fill(visualSlug);
 await page.getByLabel("البريد الإلكتروني",{exact:true}).fill(visualSlug+"@test.example");
 await page.getByLabel("كلمة المرور",{exact:false}).fill("a-strong-test-password");
 await page.getByRole("button",{name:"إنشاء الحساب",exact:true}).click();
 await expect(page.getByRole("heading",{name:"تأكيد البريد الإلكتروني",exact:true})).toBeVisible();
 await page.getByRole("link",{name:"الانتقال إلى حسابي",exact:true}).click();
 await expect(page.getByRole("heading",{name:"نظرة عامة",exact:true})).toBeVisible();
 await expect(page.getByRole("heading",{name:"لوحة التشغيل المباشر",exact:true})).toBeVisible();
 const merchantTheme=page.getByRole("combobox",{name:"المظهر"});
 await expect(merchantTheme).toHaveValue("system");
 await merchantTheme.selectOption("dark");
 await expect(page.locator(".restaurantApp")).toHaveAttribute("data-theme","dark");
 await page.reload();
 await expect(page.locator(".restaurantApp")).toHaveAttribute("data-theme","dark");
 await page.getByRole("combobox",{name:"المظهر"}).selectOption("system");
 await page.emulateMedia({colorScheme:"dark"});
 await expect(page.locator(".restaurantApp")).toHaveAttribute("data-theme","dark");
 await page.emulateMedia({colorScheme:"light"});
 await expect(page.locator(".restaurantApp")).toHaveAttribute("data-theme","light");
 await page.getByRole("combobox",{name:"المظهر"}).selectOption("light");
 await expect(page.locator(".restaurantBranchList").getByText("مطعم المعاينة",{exact:true})).toBeVisible();
 await expect(page.getByText("لا توجد طلبات نشطة الآن",{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.evaluate(()=>window.scrollTo(0,0));
 await captureScreenshot(page,{path:"work/merchant-desktop.png",fullPage:true});
 await page.getByRole("navigation",{name:"أقسام النشاط"}).getByRole("button",{name:"الباقة والمميزات",exact:true}).click();
 await expect(page.getByRole("heading",{name:"اشتراك المطعم",exact:true})).toBeVisible();
 await page.keyboard.press("Control+k");
 await expect(page.getByRole("dialog",{name:"بحث في أقسام المطعم"})).toBeVisible();
 await page.getByRole("textbox",{name:"ابحث عن قسم",exact:true}).fill("الفروع");
 await page.getByRole("dialog").getByRole("button",{name:"الفروع والإعدادات",exact:true}).click();
 await expect(page.getByRole("heading",{name:"فروع المطعم",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"إضافة الفرع",exact:true})).toBeDisabled();
 const database=await mysql.createConnection(process.env.DATABASE_URL);await database.query("SET time_zone='+00:00'");
 await database.execute("UPDATE tenant_subscriptions s JOIN tenants t ON t.id=s.tenant_id SET s.plan_id='operations-enterprise' WHERE t.slug=?",[visualSlug]);
 const [[visualTenant]]=await database.execute("SELECT t.id AS tenant,b.id AS branch FROM tenants t JOIN branches b ON b.tenant_id=t.id WHERE t.slug=? LIMIT 1",[visualSlug]);
 await database.end();
 await page.reload();
 let releaseCategories;const categoriesReady=new Promise(resolve=>{releaseCategories=resolve;});
 const categoryRoute=/\/api\/restaurant\/operations\/categories(?:\?|$)/;
 await page.route(categoryRoute,async route=>{if(route.request().method()==='GET')await categoriesReady;await route.continue();});
 await page.getByRole("navigation",{name:"أقسام النشاط"}).getByRole("button",{name:"المنيو والأصناف",exact:true}).click();
 await page.getByRole("button",{name:"التصنيفات",exact:true}).click();
 await expect(page.getByRole('button',{name:'إضافة قسم جديد',exact:true})).toBeDisabled();releaseCategories();
 await expect(page.getByRole('button',{name:'إضافة قسم جديد',exact:true})).toBeEnabled();await page.unroute(categoryRoute);
 await page.getByRole("button",{name:"إضافة قسم جديد",exact:true}).click();
 await page.getByLabel("اسم القسم",{exact:true}).fill("مشروبات المعاينة");
 await page.getByRole("button",{name:"حفظ البيانات",exact:true}).click();
 await expect(page.getByText("تم حفظ التغييرات بنجاح، ويمكنك مراجعتها في القائمة أدناه.",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"الأصناف",exact:true}).click();
 await page.getByRole("button",{name:"إضافة صنف جديد",exact:true}).click();
 await page.getByLabel("اسم الصنف",{exact:true}).fill("قهوة المعاينة");
 await page.getByLabel("السعر",{exact:true}).fill("10");
 await page.getByLabel("التصنيف",{exact:true}).selectOption({label:"مشروبات المعاينة"});
 await page.getByRole("button",{name:"حفظ البيانات",exact:true}).click();
 await expect(page.getByText("تم حفظ التغييرات بنجاح، ويمكنك مراجعتها في القائمة أدناه.",{exact:true})).toBeVisible();
 await page.getByRole("navigation",{name:"أقسام النشاط"}).getByRole("button",{name:"نقطة البيع",exact:true}).click();
 await page.locator(".restaurantPosMenu article").filter({hasText:"قهوة المعاينة"}).getByRole("button").click();
 const firstQuantity=page.locator('.restaurantCart input[type="number"]').first();await firstQuantity.fill('');await page.getByRole("button",{name:"إنشاء الطلب",exact:true}).click();expect(await firstQuantity.evaluate(input=>input.validity.valueMissing)).toBe(true);await expect(page.locator('.restaurantOrderCards article')).toHaveCount(0);await firstQuantity.fill('1');
 await page.getByRole("button",{name:"إنشاء الطلب",exact:true}).click();
 await expect(page.getByText(/تم إنشاء الطلب/)).toBeVisible();
 await page.getByRole("button",{name:"تسجيل دفع يدوي",exact:true}).click();
 await expect(page.locator(".restaurantOrderCards .restaurantPaymentBadge").getByText("مدفوع",{exact:true})).toBeVisible();
 // Exercise the real browser queue, reconnect, and replay the same request key.
 const queuedOrders=()=>page.evaluate(()=>new Promise((resolve,reject)=>{
  const open=indexedDB.open('foon-pos-offline-v1',2);
  open.onerror=()=>reject(open.error);
  open.onsuccess=()=>{const db=open.result,tx=db.transaction('orders','readonly'),read=tx.objectStore('orders').getAll();read.onsuccess=()=>resolve(read.result);read.onerror=()=>reject(read.error);tx.oncomplete=()=>db.close();};
 }));
 await page.locator('.restaurantPosMenu article').filter({hasText:'قهوة المعاينة'}).getByRole('button').click();
 await page.context().setOffline(true);
 let offlinePayload;
 try{
  await expect.poll(()=>page.evaluate(()=>navigator.onLine)).toBe(false);
  await page.getByRole('button',{name:'إنشاء الطلب',exact:true}).click();
  await expect(page.getByText('حُفظ الطلب على هذا الجهاز، ولم يصل للخادم بعد. ستتم محاولة مزامنته عند عودة الإنترنت.',{exact:true})).toBeVisible();
  await expect.poll(async()=>(await queuedOrders()).length).toBe(1);
  offlinePayload=(await queuedOrders())[0].payload;
 }finally{await page.context().setOffline(false);}
 await expect.poll(async()=>(await queuedOrders()).length,{timeout:15000}).toBe(0);
 const posHeaders={origin,'x-foon-tenant':visualTenant.tenant};
 const synced=await page.request.get(origin+'/api/restaurant/operations/pos',{headers:posHeaders});
 const syncedOrders=(await synced.json()).orders;expect(syncedOrders).toHaveLength(2);
 const offlineOrder=syncedOrders.find(order=>order.payment_status==='unpaid');expect(offlineOrder.total).toBe(10);
 const replay=await page.request.post(origin+'/api/restaurant/operations/pos',{headers:posHeaders,data:offlinePayload});expect(replay.status()).toBe(201);expect((await replay.json()).id).toBe(offlineOrder.id);
 const afterReplay=await page.request.get(origin+'/api/restaurant/operations/pos',{headers:posHeaders});expect((await afterReplay.json()).orders).toHaveLength(2);
 await page.getByRole("navigation",{name:"أقسام النشاط"}).getByRole("button",{name:"نظرة عامة",exact:true}).click();
 await expect(page.locator(".restaurantMetrics article").first().getByText("10.00 SAR",{exact:true})).toBeVisible();
 await captureScreenshot(page,{path:"work/merchant-desktop.png",fullPage:true});
 await page.getByRole("navigation",{name:"أقسام النشاط"}).getByRole("button",{name:"المنيو والأصناف",exact:true}).click();
 await page.getByRole("button",{name:"القوالب والمظهر",exact:true}).click();
 const menuResponse=await page.request.get(origin+"/api/restaurant/operations/menu",{headers:{"x-foon-tenant":visualTenant.tenant}});
 const menuData=await menuResponse.json();const fixtureCategory=menuData.references.categories[0].id;
 for(const [name,price,description] of [["لاتيه الشوفان",18,"إسبريسو وحليب الشوفان بقوام ناعم."],["شاي بالنعناع",12,"شاي دافئ مع أوراق النعناع الطازجة."],["كيكة التمر",22,"كيكة تمر ناعمة، تُقدّم مع صوص الكراميل."]]){const saved=await page.request.post(origin+"/api/restaurant/operations/menu",{headers:{origin,"x-foon-tenant":visualTenant.tenant},data:{name,status:"active",branchId:visualTenant.branch,data:{categoryId:fixtureCategory,price,description}}});expect(saved.status()).toBe(201);}
 const imageUrls=[];const tinyPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64');
 for(let i=0;i<4;i++){const uploaded=await page.request.post(origin+'/api/restaurant/assets',{headers:{origin,'x-foon-tenant':visualTenant.tenant},multipart:{file:{name:'fixture-'+i+'.png',mimeType:'image/png',buffer:tinyPng}}});expect(uploaded.status()).toBe(201);imageUrls.push((await uploaded.json()).url);}
 const coffee=menuData.resources.find(r=>r.name==='قهوة المعاينة'),fullDescription='قهوة محمصة طازجة تُحضّر بعناية، مع نكهات متوازنة وقوام غني. '.repeat(12)+'تفاصيل التحضير الكاملة محفوظة هنا.';
 const coffeeUpdated=await page.request.patch(origin+'/api/restaurant/operations/menu',{headers:{origin,'x-foon-tenant':visualTenant.tenant},data:{id:coffee.id,version:coffee.version,name:coffee.name,status:'active',branchId:visualTenant.branch,data:{categoryId:fixtureCategory,price:10,oldPrice:14,description:fullDescription,nameEn:'Preview coffee',descriptionEn:'Complete English description, including roasting and preparation.',imageUrl:imageUrls[0],calories:120,nutrition:'بروتين 3 غرام · كربوهيدرات 10 غرام',allergens:'الحليب',quantity:18}}});expect(coffeeUpdated.status()).toBe(200);
 for(let i=1;i<4;i++){const imageSaved=await page.request.post(origin+'/api/restaurant/operations/menuImages',{headers:{origin,'x-foon-tenant':visualTenant.tenant},data:{name:'صورة القهوة '+i,status:'active',branchId:visualTenant.branch,data:{itemId:coffee.id,imageUrl:imageUrls[i]}}});expect(imageSaved.status()).toBe(201);}
 const allProducts=await page.request.get(origin+'/api/restaurant/operations/menu',{headers:{'x-foon-tenant':visualTenant.tenant}});const latte=(await allProducts.json()).resources.find(r=>r.name==='لاتيه الشوفان');
 const groupSaved=await page.request.post(origin+'/api/restaurant/operations/menuGroups',{headers:{origin,'x-foon-tenant':visualTenant.tenant},data:{name:'الحجم',status:'active',branchId:visualTenant.branch,data:{itemId:latte.id,selectionType:'single',requiredFlag:'yes',minSelect:1,maxSelect:1}}});expect(groupSaved.status()).toBe(201);const optionGroup=(await groupSaved.json()).id;
 const optionSaved=await page.request.post(origin+'/api/restaurant/operations/menuValues',{headers:{origin,'x-foon-tenant':visualTenant.tenant},data:{name:'كبير',status:'active',branchId:visualTenant.branch,data:{groupId:optionGroup,priceDelta:2}}});expect(optionSaved.status()).toBe(201);const largeOption=(await optionSaved.json()).id;
 const publicContext=await browser.newContext();
 const publicPage=await publicContext.newPage();
 for(const [template,name] of [["classic","المعرض"],["minimal","القائمة"],["modern","السريع"],["sufra","السفرة"]]){
  await page.getByRole("radio",{name,exact:true}).check();
  await page.getByRole("combobox",{name:"مظهر المنيو",exact:true}).selectOption("template");
  await page.getByRole("button",{name:"حفظ القالب",exact:true}).click();
  await expect(page.getByText("تم حفظ القالب والمظهر. يظهر التغيير في منيو مطعمك مباشرة.",{exact:true})).toBeVisible();
  await publicPage.setViewportSize({width:1440,height:1000});
  await publicPage.goto(origin+"/"+visualSlug);
  await expect(publicPage.getByRole("heading",{name:"مطعم المعاينة",exact:true})).toHaveCount(1);
  await expect(publicPage.locator(".publicMenu")).toHaveAttribute("data-template",template);
  await expect(publicPage.getByRole("heading",{name:"قهوة المعاينة",exact:true})).toBeVisible();
  await publicPage.getByRole("searchbox",{name:"البحث في المنيو"}).fill("لا يوجد صنف بهذا الاسم");
  await expect(publicPage.getByRole("heading",{name:"لا توجد أصناف مطابقة",exact:true})).toBeVisible();
  await publicPage.getByRole("searchbox",{name:"البحث في المنيو"}).fill("");
  await publicPage.setViewportSize({width:390,height:844});
  const mobileDock=publicPage.getByRole('navigation',{name:'التنقل في المنيو',exact:true});
  await expect(mobileDock).toBeVisible();
  await expect(publicPage.locator('.publicMenuHeader .publicMenuAccountLink')).toBeHidden();
  await expect(publicPage.locator('.publicMenuHeader .publicMenuCategoryTrigger')).toBeHidden();
  await expect(mobileDock.locator('.publicMenuServices')).toHaveCount(0);
  await expect(mobileDock.locator('a[href$="/login"]')).toHaveCount(1);
  await mobileDock.getByRole('button',{name:'السلة',exact:false}).click();
  const emptyCart=publicPage.getByRole('dialog',{name:'السلة',exact:true});await expect(emptyCart).toContainText('سلتك فارغة');await emptyCart.press('Escape');
  await mobileDock.getByRole('button',{name:'الأقسام',exact:true}).click();await expect(publicPage.getByRole('dialog').getByRole('heading',{name:'أقسام المنيو',exact:true})).toBeVisible();await publicPage.getByRole('dialog').press('Escape');
  await publicPage.setViewportSize({width:1440,height:1000});
  await publicPage.getByRole("button",{name:"إضافة قهوة المعاينة إلى السلة",exact:true}).click();
  await expect(publicPage.getByLabel("كمية قهوة المعاينة",{exact:true})).toHaveValue("1");
  await publicPage.evaluate(()=>window.scrollTo(0,0));
  await captureScreenshot(publicPage,{path:"work/menu-"+template+"-desktop.png",fullPage:true});
  expect(await publicPage.locator('.publicMenuItem').evaluateAll(nodes=>nodes.every(n=>{const c=n.getBoundingClientRect(),p=n.querySelector('.publicMenuProductPrice strong').getBoundingClientRect(),b=n.querySelector('.publicMenuCardCart').getBoundingClientRect();return p.left>=c.left-1&&p.right<=c.right+1&&!(p.left<b.right&&p.right>b.left&&p.top<b.bottom&&p.bottom>b.top)}))).toBeTruthy();
  await publicPage.setViewportSize({width:390,height:844});
  await mobileDock.getByRole('button',{name:/السلة/}).click();await expect(publicPage.getByLabel('كمية قهوة المعاينة',{exact:true})).toBeInViewport();
  expect(await mobileDock.evaluate(n=>{const r=n.getBoundingClientRect();return r.bottom<=innerHeight+1&&r.top>=0&&r.left>=0&&r.right<=innerWidth})).toBeTruthy();
  await mobileDock.getByRole('link',{name:'القائمة',exact:true}).click();
  expect(await publicPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await captureScreenshot(publicPage,{path:"work/menu-"+template+"-mobile.png",fullPage:true});
  const gridBounds=await publicPage.locator('.publicMenuItem').evaluateAll(nodes=>nodes.slice(0,4).map(n=>{const r=n.getBoundingClientRect();return {top:r.top,width:r.width}}));expect(gridBounds.length).toBe(4);expect(gridBounds[0].top,JSON.stringify(gridBounds)).toBe(gridBounds[1].top);expect(gridBounds[2].top,JSON.stringify(gridBounds)).toBe(gridBounds[3].top);expect(gridBounds.every(r=>r.width>140&&r.width<190)).toBeTruthy();
  const coffeeCard=publicPage.locator('.publicMenuItem').filter({has:publicPage.getByRole('heading',{name:'قهوة المعاينة',exact:true})});await expect(coffeeCard.getByRole('img',{name:'قهوة المعاينة',exact:true})).toHaveJSProperty('naturalWidth',800);await expect(coffeeCard.locator('del')).toContainText('14.00');await expect(coffeeCard.locator('.publicMenuProductPrice strong')).toContainText('10.00');await expect(coffeeCard.locator('.publicMenuItemSummary')).toBeHidden();const imageBounds=await coffeeCard.locator('.publicMenuItemImage').evaluate(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height}});expect(Math.abs(imageBounds.width-imageBounds.height)).toBeLessThanOrEqual(1);await coffeeCard.getByRole('button',{name:'تفاصيل قهوة المعاينة'}).click();const productDetails=publicPage.getByRole('dialog',{name:'قهوة المعاينة'});await expect(productDetails).toBeVisible();await expect(productDetails.locator('.publicMenuProductScroll section p').first()).not.toBeEmpty();await productDetails.press('Escape');
  await captureScreenshot(publicPage,{path:"work/menu-"+template+"-mobile.png",fullPage:true});
 }
 const localeSelect=publicPage.getByRole('combobox',{name:'Language / اللغة'}),menuRoot=publicPage.locator('.publicMenu');
 for(const language of ['ar','en','fr']){
  await localeSelect.selectOption(language);await expect(menuRoot).toHaveAttribute('lang',language);await expect(menuRoot).toHaveAttribute('dir',language==='ar'?'rtl':'ltr');
  for(const width of [320,390,576,577,768,992,993,1024,1150,1151,1366,1440,1680,1919,1920]){
   await publicPage.setViewportSize({width,height:900});
   const layout=await publicPage.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,width:innerWidth,direction:getComputedStyle(document.querySelector('.publicMenu')).direction,titleDirection:getComputedStyle(document.querySelector('.publicMenuSectionTitle')).direction,columns:getComputedStyle(document.querySelector('.publicMenu .publicMenuLayout .publicMenuItems')).gridTemplateColumns.split(' ').length}));
   expect(layout.scrollWidth,`${language} ${width}px overflow`).toBeLessThanOrEqual(layout.width);expect(layout.direction).toBe(language==='ar'?'rtl':'ltr');expect(layout.titleDirection).toBe(layout.direction);
   const expectedColumns=width<=576?2:width<=950?4:width<=1199?2:width<=1499?3:width<=1899?4:width<=2299?5:6;expect(layout.columns,`${language} ${width}px columns`).toBe(expectedColumns);
   if(language==='ar'&&width===320||language==='en'&&width===768||language==='fr'&&width===1440)await captureScreenshot(publicPage,{path:`work/menu-responsive-${language}-${width}.png`,fullPage:true});
  }
 }
 await localeSelect.selectOption('ar');await publicPage.setViewportSize({width:390,height:844});
 const themeToggle=publicPage.locator('.publicMenu .foonStorefrontThemeToggle');
 await themeToggle.click();await expect(menuRoot).toHaveAttribute('data-color-mode','light');
 const darkContrast=await menuRoot.evaluate(el=>{const s=getComputedStyle(el),hex=(v)=>{const n=v.replace('#','');return [0,2,4].map(i=>parseInt(n.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4)};const lum=hex(s.getPropertyValue('--public-brand').trim()).reduce((a,c,i)=>a+c*[.2126,.7152,.0722][i],0),on=hex(s.getPropertyValue('--public-on-brand').trim()).reduce((a,c,i)=>a+c*[.2126,.7152,.0722][i],0);return (Math.max(lum,on)+.05)/(Math.min(lum,on)+.05)});expect(darkContrast).toBeGreaterThanOrEqual(4.5);
 await themeToggle.click();await expect(menuRoot).toHaveAttribute('data-color-mode','dark');
 await publicPage.setViewportSize({width:320,height:740});expect(await publicPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();expect(await publicPage.locator('.publicMenu .publicMenuLayout .publicMenuItems').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length)).toBe(2);
 expect(await publicPage.locator('.publicMenuMobileDock').evaluate(n=>{const r=n.getBoundingClientRect();return r.bottom<=innerHeight+1&&r.top>=0&&r.left>=0&&r.right<=innerWidth})).toBeTruthy();
 await publicPage.setViewportSize({width:390,height:844});
 await publicPage.getByRole('button',{name:'تفاصيل قهوة المعاينة',exact:true}).click();const details=publicPage.getByRole('dialog',{name:'قهوة المعاينة',exact:true});await expect(details).toBeVisible();await expect(details.getByText(fullDescription,{exact:true})).toBeVisible();await expect(details.getByText('مسببات الحساسية',{exact:true})).toBeVisible();await expect(details.getByText('بروتين 3 غرام · كربوهيدرات 10 غرام',{exact:true})).toBeVisible();await expect(details.getByText('120 kcal',{exact:true})).toBeVisible();await expect(details.locator('del')).toContainText('14.00');
 await details.getByRole('button',{name:'الصورة 4',exact:true}).click();await expect(details.getByRole('button',{name:'الصورة 4',exact:true})).toHaveAttribute('aria-pressed','true');await expect(details.locator('.publicMenuProductPhoto img')).not.toHaveAttribute('src',imageUrls[0]);await captureScreenshot(details,{path:'work/menu-product-details-mobile.png'});
 await details.press('Escape');await expect(details).toHaveCount(0);await expect(publicPage.getByRole('button',{name:'تفاصيل قهوة المعاينة',exact:true})).toBeFocused();
 await publicPage.getByRole('button',{name:'إضافة لاتيه الشوفان إلى السلة',exact:true}).click();const latteDetails=publicPage.getByRole('dialog',{name:'لاتيه الشوفان',exact:true});await expect(latteDetails.getByRole('button',{name:'إضافة إلى السلة',exact:true})).toBeDisabled();await latteDetails.getByLabel('خيارات الحجم',{exact:true}).selectOption(largeOption);await expect(latteDetails.locator('.publicMenuProductPrice strong')).toContainText('20.00');await latteDetails.getByRole('button',{name:'إضافة إلى السلة',exact:true}).click();await expect(latteDetails).toHaveCount(0);await expect(publicPage.getByLabel('كمية لاتيه الشوفان',{exact:true})).toHaveValue('1');
 await publicPage.locator('.publicMenuMobileDock').getByRole('button',{name:'الأقسام',exact:true}).click();
 await expect(publicPage.getByRole('dialog').getByRole('heading',{name:'أقسام المنيو',exact:true})).toBeVisible();
 await publicPage.getByRole('dialog').getByRole('button',{name:'مشروبات المعاينة',exact:false}).click();
 await expect(publicPage.getByRole('dialog')).toHaveCount(0);
 const groupedNav=page.getByRole('navigation',{name:'أقسام النشاط'});
 const dailyToggle=groupedNav.getByRole('button',{name:/العمل اليومي/});
 await expect(dailyToggle).toHaveAttribute('aria-expanded','true');
 await dailyToggle.click();
 await expect(dailyToggle).toHaveAttribute('aria-expanded','false');
 await expect(groupedNav.getByRole('button',{name:'الطاولات',exact:true})).toHaveCount(0);
 await dailyToggle.click();
 await expect(dailyToggle).toHaveAttribute('aria-expanded','true');
 await expect(groupedNav.getByRole('button',{name:'الطاولات',exact:true})).toBeVisible();
 await page.getByRole('navigation',{name:'أقسام النشاط'}).getByRole('button',{name:'الطاولات',exact:true}).click();
 await page.getByRole('button',{name:'الإضافة الجماعية',exact:true}).click();
 await page.getByLabel('اسم القسم',{exact:true}).fill('صالة العائلات');
 await page.getByLabel('عدد الطاولات',{exact:true}).fill('3');
 await page.getByRole('button',{name:'إنشاء الدفعة',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('تم إنشاء 3 طاولة');
 const floors=await page.request.get(origin+'/api/restaurant/operations/sections',{headers:{'x-foon-tenant':visualTenant.tenant}});const familySection=(await floors.json()).resources.find(r=>r.name==='صالة العائلات').id;
 await captureScreenshot(page,{path:'work/merchant-dining-batch-desktop.png',fullPage:true});
 const dining=await page.request.post(origin+'/api/restaurant/operations/tables',{headers:{origin,'x-foon-tenant':visualTenant.tenant},data:{name:'طاولة 7',branchId:visualTenant.branch,status:'available',data:{sectionId:familySection,number:7,capacity:4}}});expect(dining.status()).toBe(201);
 const tableId=(await dining.json()).id;
 const occupiedDining=await page.request.post(origin+'/api/restaurant/operations/tables',{headers:{origin,'x-foon-tenant':visualTenant.tenant},data:{name:'طاولة مشغولة 8',branchId:visualTenant.branch,status:'occupied',data:{sectionId:familySection,number:8,capacity:4}}});expect(occupiedDining.status()).toBe(201);
 const occupiedTableId=(await occupiedDining.json()).id;
 await publicPage.reload();
 await publicPage.locator('.publicMenuHeaderActions').getByRole('button',{name:'نداء النادل',exact:true}).click();
 await publicPage.getByRole('dialog').getByRole('button',{name:'إنشاء حساب سريع',exact:true}).click();
 await publicPage.getByRole('dialog').getByLabel('الاسم',{exact:true}).fill('ضيف المعاينة');
 await publicPage.getByRole('dialog').getByLabel('البريد الإلكتروني',{exact:true}).fill(visualSlug+"-guest@test.example");
 await publicPage.getByRole('dialog').getByLabel('كلمة المرور',{exact:true}).fill('a-strong-test-password');
 await publicPage.getByRole('dialog').getByRole('button',{name:'متابعة الطلب',exact:true}).click();
 await expect(publicPage.getByRole('dialog').getByLabel('رقم الطاولة',{exact:true})).toBeVisible();
 await captureScreenshot(publicPage.getByRole('dialog'),{path:'work/menu-waiter-mobile.png'});
 await publicPage.getByRole('dialog').getByLabel('رقم الطاولة',{exact:true}).selectOption(occupiedTableId);
 await publicPage.getByRole('dialog').getByRole('button',{name:'إرسال الطلب',exact:true}).click();
 await expect(publicPage.getByRole('dialog').getByRole('status')).toContainText('وصل النداء');
 await publicPage.getByRole('dialog').getByRole('button',{name:'تم',exact:true}).click();
 await publicPage.locator('.publicMenuInfoBar .publicMenuServices').getByRole('button',{name:'حجز طاولة',exact:true}).click();
 const bookingDialog=publicPage.getByRole('dialog',{name:'حجز طاولة',exact:true});
 await expect(bookingDialog).toBeVisible();
 await expect(bookingDialog.getByRole('button',{name:'متابعة كعميل لهذا المطعم',exact:true})).toHaveCount(0);
 await bookingDialog.getByLabel('القسم المطلوب',{exact:true}).selectOption(familySection);
 const nextDay=new Date(Date.now()+86400000);const localDate=new Date(nextDay.getTime()-nextDay.getTimezoneOffset()*60000).toISOString().slice(0,16);
 const bookingCalendar=publicPage.getByRole('dialog',{name:'حجز طاولة',exact:true}).locator('.foonBookingCalendar');
 if(nextDay.getMonth()!==new Date().getMonth())await bookingCalendar.getByRole('button',{name:'Next month',exact:true}).click();
 await bookingCalendar.getByRole('button',{name:String(nextDay.getDate()),exact:true}).click();
 await bookingCalendar.locator('select').nth(0).selectOption(localDate.slice(11,13));
 await bookingCalendar.locator('select').nth(1).selectOption(localDate.slice(14,16));
 await expect(bookingCalendar.locator('input[name="scheduledAt"]')).toHaveValue(localDate);
 await publicPage.getByRole('dialog').getByLabel('رقم التواصل',{exact:true}).fill('0500000000');
 await publicPage.getByRole('dialog').getByRole('button',{name:'إرسال الطلب',exact:true}).click();
 await expect(publicPage.getByRole('dialog').getByRole('status')).toContainText('ينتظر التأكيد');
 await captureScreenshot(publicPage.getByRole('dialog'),{path:'work/menu-booking-mobile.png'});
 await publicPage.getByRole('dialog').getByRole('button',{name:'تم',exact:true}).click();
 const calls=await page.request.get(origin+'/api/restaurant/operations/waiterCalls',{headers:{'x-foon-tenant':visualTenant.tenant}});expect((await calls.json()).resources.some(row=>row.data.tableId===occupiedTableId&&row.status==='pending')).toBeTruthy();
 await page.getByRole('navigation',{name:'أقسام النشاط'}).getByRole('button',{name:'الطاولات',exact:true}).click();
 await page.getByRole('button',{name:'نداءات النادل',exact:true}).click();
 await expect(page.getByText('ضيف المعاينة',{exact:true})).toBeVisible();
 await publicPage.getByRole('button',{name:'إضافة قهوة المعاينة إلى السلة',exact:true}).click();
 await publicPage.getByLabel('نوع الطلب',{exact:true}).selectOption('dine_in');
 await expect(publicPage.locator('#menu-cart').getByLabel('رقم الطاولة',{exact:true}).locator('option[value="'+occupiedTableId+'"]')).toHaveCount(0);
 await publicPage.locator('#menu-cart').getByLabel('رقم الطاولة',{exact:true}).selectOption(tableId);
 await publicPage.locator('#menu-cart').getByRole('spinbutton',{name:/^عدد الأشخاص/}).fill('3');
 await publicPage.getByRole('button',{name:'تسجيل الطلب',exact:true}).click();
 await expect(publicPage.locator('.publicMenuMessage')).toContainText('تم تسجيل طلبك');
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('navigation',{name:'أقسام النشاط'}).getByRole('button',{name:'الحجوزات والانتظار',exact:true}).click();
 await expect(page.getByRole('heading',{name:'تقويم الحجوزات',exact:true})).toBeVisible();
 await expect(page.locator('.calendarEvent').filter({hasText:'ضيف المعاينة'})).toBeVisible();
 await captureScreenshot(page,{path:'work/merchant-reservations-calendar-desktop.png',fullPage:true});
 await page.locator('.calendarEvent').filter({hasText:'ضيف المعاينة'}).click();
 await expect(page.getByRole('dialog',{name:'تفاصيل الحجز'}).getByLabel('اسم الضيف',{exact:true})).toHaveValue('ضيف المعاينة');
 await page.getByRole('dialog',{name:'تفاصيل الحجز'}).getByLabel('الحالة',{exact:true}).selectOption('confirmed');
 await page.getByRole('dialog',{name:'تفاصيل الحجز'}).getByRole('button',{name:'حفظ البيانات',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'تفاصيل الحجز'})).toHaveCount(0);
 await expect(page.locator('.calendarEvent').filter({hasText:'ضيف المعاينة'})).toHaveAttribute('data-status','confirmed');
 const bookingDay=new Date(nextDay.getTime()+3*3600000).toISOString().slice(0,10);await page.getByRole('button',{name:'عرض حجوزات '+bookingDay,exact:true}).click();
 await page.getByRole('button',{name:'أسبوع',exact:true}).click();await expect(page.locator('.calendarGrid-week')).toBeVisible();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await captureScreenshot(page,{path:'work/merchant-reservations-calendar-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'يوم',exact:true}).click();await expect(page.locator('.calendarGrid-day')).toBeVisible();
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('button',{name:'قائمة الحجوزات',exact:true}).click();
 const reservationCard=page.locator('.restaurantResourceList article').filter({hasText:'ضيف المعاينة'});await expect(reservationCard).toHaveAttribute('data-status','confirmed');await expect(reservationCard.locator('time')).toHaveAttribute('datetime',/\d{4}-\d{2}-\d{2}T/);await expect(reservationCard).toContainText('صالة العائلات');
 await captureScreenshot(page,{path:'work/merchant-reservation-cards-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await captureScreenshot(page,{path:'work/merchant-reservation-cards-mobile.png',fullPage:true});
 await reservationCard.getByRole('button',{name:'تعديل',exact:true}).click();await expect(page.getByLabel('اسم الضيف',{exact:true})).toHaveValue('ضيف المعاينة');await page.getByRole('button',{name:'إلغاء',exact:true}).click();
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('navigation',{name:'أقسام النشاط'}).getByRole('button',{name:'الطلبات',exact:false}).click();await expect(page.locator('.restaurantOrderCards article').first()).toBeVisible();await captureScreenshot(page,{path:'work/merchant-order-cards-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();const smallOrderActions=await page.locator('.restaurantOrderActions button').evaluateAll(nodes=>nodes.map(n=>({label:(n.textContent||'').trim(),height:n.getBoundingClientRect().height,display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility})).filter(n=>n.height<44&&n.display!=='none'&&n.visibility!=='hidden'));expect(smallOrderActions,'Order buttons below 44px: '+JSON.stringify(smallOrderActions)).toEqual([]);await captureScreenshot(page,{path:'work/merchant-order-cards-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1000});
 await publicPage.setViewportSize({width:320,height:700});
  await publicPage.goto(origin+'/customer');
  await expect(publicPage.locator('.customerOrderCard').first()).toBeVisible();
  const accountTheme=publicPage.getByRole("combobox",{name:"المظهر"});
  await accountTheme.selectOption("light");
  await expect(publicPage.locator(".customerDashboard")).toHaveAttribute("data-theme","light");
  await accountTheme.selectOption("system");
  await publicPage.emulateMedia({colorScheme:"dark"});
  await expect(publicPage.locator(".customerDashboard")).toHaveAttribute("data-theme","dark");
  await publicPage.emulateMedia({colorScheme:"light"});
  await expect(publicPage.locator(".customerDashboard")).toHaveAttribute("data-theme","light");
  const customerNav=publicPage.locator('.customerMobileNavigation');
  await expect(customerNav.locator('a')).toHaveCount(5);
  await expect(customerNav.locator('a[href="#customer-orders"]')).toBeVisible();
  await expect(publicPage.locator('#customer-addresses')).toBeVisible();
  await customerNav.locator('a[href="#customer-addresses"]').click();
  await expect(customerNav.locator('a[href="#customer-addresses"]')).toHaveAttribute('aria-current','location');
  expect(await publicPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await captureScreenshot(publicPage,{path:'work/menu-customer-orders-mobile.png',fullPage:true});
 await publicPage.goto(origin+"/"+visualSlug);
 await expect(publicPage.getByText(/المنيو محفوظ للتصفح دون اتصال/)).toBeVisible();
 await publicContext.setOffline(true);
 const offlineFrame=publicPage.frameLocator('iframe[title="المنيو — تصفح دون اتصال"]');
 await expect(offlineFrame.locator('#notice')).toContainText('للتصفح فقط');
 await expect(offlineFrame.locator('form')).toHaveCount(0);
 await publicPage.reload();
 await expect(publicPage.locator('#notice')).toContainText('للتصفح فقط');
 await expect(publicPage.locator('article').first()).toBeVisible();
 expect(await publicPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await captureScreenshot(publicPage,{path:'work/menu-offline-mobile.png',fullPage:true});
 await publicContext.setOffline(false);
 await publicPage.close();
 await publicContext.close();
 // An existing customer from another store must join before accessing booking fields.
 // Joining on mobile must also unlock the separate desktop service instance.
 const unlinkedContext=await browser.newContext({viewport:{width:390,height:844}});
 try{
  const registered=await unlinkedContext.request.post(origin+'/api/customer/register',{headers:{origin},data:{storeSlug:'operations-owner-b',name:'عميل متجر آخر',email:visualSlug+"-unlinked@test.example",password:'a-strong-test-password'}});
  expect(registered.status()).toBe(201);
  const customerPage=await unlinkedContext.newPage();
  await customerPage.goto(origin+"/"+visualSlug);
  await customerPage.locator('.publicMenuInfoBar .publicMenuServices').getByRole('button',{name:'حجز طاولة',exact:true}).click();
  const joinDialog=customerPage.getByRole('dialog',{name:'حجز طاولة',exact:true});
  await expect(joinDialog).toBeVisible();
  await expect(joinDialog.getByLabel('القسم المطلوب',{exact:true})).toHaveCount(0);
  await joinDialog.getByRole('button',{name:'متابعة كعميل لهذا المطعم',exact:true}).click();
  await expect(joinDialog.getByLabel('القسم المطلوب',{exact:true})).toBeVisible();
  await joinDialog.getByLabel('القسم المطلوب',{exact:true}).selectOption(familySection);
  await joinDialog.getByRole('button',{name:'إغلاق',exact:true}).click();
  await customerPage.setViewportSize({width:1440,height:1000});
  await customerPage.locator('.publicMenuInfoBar').getByRole('button',{name:'حجز طاولة',exact:true}).click();
  await expect(customerPage.getByRole('dialog',{name:'حجز طاولة',exact:true}).getByLabel('القسم المطلوب',{exact:true})).toBeVisible();
  await customerPage.reload();
  await customerPage.locator('.publicMenuInfoBar').getByRole('button',{name:'حجز طاولة',exact:true}).click();
  await expect(customerPage.getByRole('dialog',{name:'حجز طاولة',exact:true}).getByLabel('القسم المطلوب',{exact:true})).toBeVisible();
 }finally{await unlinkedContext.close();}
 await page.getByRole('navigation',{name:'أقسام النشاط'}).getByRole('button',{name:'المنيو والأصناف',exact:true}).click();
 await page.getByRole('button',{name:'القوالب والمظهر',exact:true}).click();
 await page.getByRole("button",{name:"معاينة القالب",exact:true}).click();
 await expect(page.locator(".menuPreviewViewport .publicMenu")).toHaveAttribute("data-template","sufra");
 await expect(page.locator(".menuPreviewViewport").getByText("معاينة",{exact:true})).toBeVisible();
 await page.getByRole("combobox",{name:"مظهر المنيو",exact:true}).selectOption("light");
 await expect(page.locator(".menuPreviewViewport .publicMenu")).toHaveAttribute("data-color-mode","light");
 const unchanged=await page.request.get(origin+"/api/restaurant/menu/appearance",{headers:{"x-foon-tenant":visualTenant.tenant}});expect((await unchanged.json()).colorMode).toBe("template");
 await page.getByRole("combobox",{name:"مظهر المنيو",exact:true}).selectOption("template");
 await captureScreenshot(page.locator(".menuTemplateEditor"),{path:"work/menu-studio-preview.png"});
 await page.getByRole("button",{name:"إغلاق المعاينة",exact:true}).click();
 await page.getByRole("navigation",{name:"أقسام النشاط"}).getByRole("button",{name:"نظرة عامة",exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByRole("button",{name:"فتح قائمة النشاط",exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await captureScreenshot(page,{path:"work/merchant-mobile.png",fullPage:true});
 await page.getByRole("button",{name:"فتح قائمة النشاط",exact:true}).click();
 const mobileNavigation=page.locator(".restaurantDrawer").getByRole("navigation",{name:"أقسام النشاط"});
 await expect(mobileNavigation.locator(".restaurantNavTaskGroup")).toHaveCount(6);
 await expect(mobileNavigation.getByRole("button",{name:/الفروع والفريق/})).toHaveAttribute("aria-expanded","true");
 await page.locator(".restaurantDrawer").getByRole("button",{name:"الفروع والإعدادات",exact:true}).click();
 await expect(page.getByRole("heading",{name:"فروع المطعم",exact:true})).toBeVisible();
 // Branch selection lives in the responsive topbar; verify the branch card after navigating on mobile.
 await expect(page.locator(".restaurantBranchList").getByText("مطعم المعاينة",{exact:true})).toBeVisible();
 // A foreign tenant address must not expose its workspace.
 const db=await mysql.createConnection(process.env.DATABASE_URL);
 const foreignId=randomUUID();
 await db.execute("INSERT INTO tenants(id,slug,name,status) VALUES (?,?,'Private foreign tenant','active')",[foreignId,"visual-foreign-"+randomUUID().slice(0,8)]);
 await db.end();
 await page.goto(origin+"/restaurant?tenant="+foreignId);
 await expect(page.getByText("Private foreign tenant",{exact:true})).toHaveCount(0);
});
test("all 15 activities expose their own tools; service orders work in three languages at 320px",async({browser})=>{
 const activities=["restaurant","cafe","sweets","grocery","clothing","perfume","accessories","watches","gifts","ecommerce","carwash","laundry","automotive","salon","publicworks"];
 const services=new Set(["carwash","laundry","automotive","salon","publicworks"]);
 const db=await mysql.createConnection(process.env.DATABASE_URL);
 try{
  for(const activity of activities){
   console.info("Activity workspace:",activity);
   const context=await browser.newContext({viewport:{width:1440,height:1000}});
   try{
    context.setDefaultTimeout(12000);
    const slug="service-ui-"+activity+"-"+randomUUID().slice(0,8);
    const created=await context.request.post(origin+"/api/auth/register",{headers:{origin},data:{name:"Activity owner",storeName:"Activity "+activity,slug,email:slug+"@test.example",password:"a-strong-test-password",activity,countryCode:"SA",currency:"SAR",region:"الرياض"}});
    expect(created.status(),await created.text()).toBe(201);
    const account=await created.json();
    if(activity==="watches"){
     expect(account.activity).toBe("watches");
     expect(account.activityModules).toContain("variants");
     expect(account.activityModules).not.toContain("kitchen");
     expect(account.activityModules).not.toContain("tables");
    }
    await db.execute("UPDATE tenant_subscriptions SET plan_id='operations-enterprise' WHERE tenant_id=?",[account.tenant.id]);
    const page=await context.newPage();
    const assignedRequests=[];
    page.on('request',request=>{if(request.url().includes('/assigned-service'))assignedRequests.push(request.url());});
    await page.goto(origin+"/restaurant?tenant="+account.tenant.id);
    await expect(page.locator('.restaurantApp')).toHaveAttribute('data-activity',activity);
    await expect(page.locator('.foonActivityTools')).toBeVisible();
    const destinations=await page.locator('.foonActivityTools a').evaluateAll(links=>links.map(link=>link.href));expect(new Set(destinations).size).toBe(destinations.length);
    await expect(page.locator('.foonActivityTools a[href$="/payments"]')).toBeVisible();
    const navigation=page.getByRole('navigation',{name:'أقسام النشاط',exact:true});
    const dining=activity==="restaurant"||activity==="cafe";
    if(activity!=="restaurant"){
     await expect(page.locator('.restaurantHero')).not.toContainText('المطعم');
     await expect(page.locator('.restaurantHero h2')).not.toHaveText('لوحة التشغيل المباشر');
    }
    if(!dining){
     if(services.has(activity))await expect(page.locator('.restaurantMetrics')).toHaveCount(0);
     else await expect(page.locator('.restaurantMetrics')).not.toContainText('الطاولات');
     await expect(navigation.getByRole('button',{name:'الطاولات',exact:true})).toHaveCount(0);
     expect(assignedRequests).toHaveLength(0);
    }
    if(activity!=="restaurant"){
     await navigation.getByRole('button',{name:services.has(activity)?'دليل الخدمات':activity==="cafe"?'قائمة المشروبات والمأكولات':'المنتجات والأقسام',exact:true}).click();
     await expect(page.getByLabel(services.has(activity)?'اسم الخدمة':activity==="cafe"?'اسم المشروب أو الصنف':'اسم المنتج',{exact:true})).toBeVisible();
     await navigation.getByRole('button',{name:activity==="grocery"?'هوية واجهة السوبر ماركت':'هوية واجهة النشاط',exact:true}).click();
     await expect(page.locator('.restaurantResourceForm')).toHaveCount(0);
    }
    if(!dining){
     await navigation.getByRole('button',{name:'نقطة البيع',exact:true}).click();
     await expect(page.locator('select[name="channel"] option[value="dine_in"]')).toHaveCount(0);
     await expect(page.locator('.restaurantListTools')).toHaveCount(0);
     await expect(page.locator('.restaurantPosCheckout')).not.toContainText('المطبخ');
    }
    if(activity!=="restaurant"){
     const headers={origin,"x-foon-tenant":account.tenant.id};
     const categoryResponse=await context.request.post(origin+"/api/restaurant/activity-catalog",{headers,data:{kind:"category",name:"POS category "+activity}});
     expect(categoryResponse.status(),await categoryResponse.text()).toBe(201);
     const category=(await categoryResponse.json()).id;
     const productName="POS product "+activity;
     const productResponse=await context.request.post(origin+"/api/restaurant/activity-catalog",{headers,data:{kind:"product",name:productName,categoryId:category,price:7.25}});
     expect(productResponse.status(),await productResponse.text()).toBe(201);
     if(activity==="grocery"){
      await navigation.getByRole('button',{name:'المنتجات والأقسام',exact:true}).click();
      const row=page.locator('.foonCatalogRow').filter({hasText:productName});
      await row.getByRole('button',{name:'إدارة الصور',exact:true}).click();
      const gallery=row.getByRole('region',{name:'صور المنتج',exact:true});
      const png=await sharp({create:{width:1200,height:600,channels:3,background:'#4a83c1'}}).png().toBuffer();
      for(let i=0;i<4;i++){
       await gallery.locator('input[type="file"]').setInputFiles({name:'catalog-'+i+'.png',mimeType:'image/png',buffer:png});
       await expect(gallery.locator('img')).toHaveCount(i+1);
      }
      await expect(gallery.locator('input[type="file"]')).toBeDisabled();
      const previous=await gallery.locator('img').nth(3).getAttribute('src');
      await gallery.getByRole('button',{name:'اجعلها الرئيسية',exact:true}).nth(3).click();
      await expect(gallery.locator('img').first()).toHaveAttribute('src',previous);
      await gallery.getByRole('button',{name:'إزالة الصورة',exact:true}).first().click();
      await expect(gallery.locator('img')).toHaveCount(3);
      await expect(gallery.locator('input[type="file"]')).toBeEnabled();
      await page.getByLabel('اسم المنتج',{exact:true}).fill('Unsaved product');
      await page.getByLabel('السعر',{exact:true}).fill('12.34');
      for(const [locale,title] of [['en','Product images'],['fr','Images du produit'],['ar','صور المنتج']]){
       await page.getByRole('combobox',{name:'اللغة / Language / Langue',exact:true}).selectOption(locale);
       await page.setViewportSize({width:320,height:900});
       await expect(row.getByRole('region',{name:title,exact:true})).toBeVisible();
       await expect(page.getByRole('heading',{name:locale==='ar'?'إدارة المنتجات':locale==='en'?'Manage products':'Gérer les produits',exact:true})).toBeVisible();
       await expect(page.getByLabel(locale==='ar'?'اسم المنتج':locale==='en'?'Product name':'Nom du produit',{exact:true})).toBeVisible();
       await expect(page.getByLabel(locale==='ar'?'السعر':locale==='en'?'Price':'Prix',{exact:true})).toHaveAttribute('dir','ltr');
       await expect(row).toContainText(productName);
       await expect(page.getByLabel(locale==='ar'?'اسم المنتج':locale==='en'?'Product name':'Nom du produit',{exact:true})).toHaveValue('Unsaved product');
       await expect(page.getByLabel(locale==='ar'?'السعر':locale==='en'?'Price':'Prix',{exact:true})).toHaveValue('12.34');
       const bounds=await row.getByRole('region',{name:title,exact:true}).boundingBox();
       expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(320);
       expect(await row.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
       expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
       await captureScreenshot(page,{path:'work/merchant-catalog-images-'+locale+'-320.png',fullPage:true});
      }
      await page.setViewportSize({width:1440,height:1000});
     }
     await navigation.getByRole('button',{name:'نظرة عامة',exact:true}).click();
     await navigation.getByRole('button',{name:'نقطة البيع',exact:true}).click();
     const product=page.locator('.restaurantPosProduct').filter({hasText:productName});
     await expect(product).toContainText('7.25');
     await product.getByRole('button',{name:'+ إضافة إلى الطلب',exact:true}).click();
     await page.locator('.restaurantPosCheckout').getByRole('button',{name:'إنشاء الطلب',exact:true}).click();
     await expect(page.locator('.restaurantOrderCards article').filter({hasText:productName})).toContainText('7.25');
     await expect(page.locator('.restaurantOrderCards article').filter({hasText:productName})).toContainText('SAR');
    }
    if(services.has(activity)&&activity!=="laundry"){
     await navigation.getByRole('button',{name:'المواعيد',exact:true}).click();
     await expect(page.locator('.foonServiceOrders')).toBeVisible();
     await expect(page.getByRole('button',{name:'قائمة الانتظار',exact:true})).toHaveCount(0);
    }
    const serviceLink=navigation.getByRole('button',{name:'أوامر الخدمة',exact:true});
    if(!services.has(activity)){await expect(serviceLink).toHaveCount(0);continue;}
    await expect(serviceLink).toBeVisible();
    await navigation.getByRole('button',{name:'نظرة عامة',exact:true}).click();
    await page.locator('.foonActivityTools').getByRole('link',{name:'أوامر الخدمة',exact:false}).click();
    const workspace=page.locator('.foonServiceOrders');
    await expect(workspace.getByRole('heading',{name:'أوامر الخدمة',exact:true})).toBeVisible();
    if(activity!=="carwash")continue;
    await expect(workspace.getByText('جارٍ التحميل…',{exact:true})).toHaveCount(0);
    await workspace.getByRole('button',{name:'إنشاء أمر خدمة',exact:true}).click();
    const form=workspace.locator('form');
    await expect(form.locator('select[name="status"] option')).toHaveCount(2);
    await form.getByLabel('عنوان الخدمة',{exact:true}).fill('خدمة معاينة السيارة');
    await form.getByLabel('اسم العميل',{exact:true}).fill('عميل الخدمة');
    await form.getByLabel('جوال العميل',{exact:true}).fill('٠٥٠٠٠٠٤٣٢١');
    await expect(form.getByLabel('جوال العميل',{exact:true})).toHaveValue('0500004321');
    await form.getByLabel('تفاصيل الخدمة',{exact:true}).fill('Service '+"X".repeat(120));
    await form.locator('input[name="amount"]').fill('45.50');
    await form.locator('select[name="branchId"]').selectOption(account.branch.id);
    await form.getByRole('button',{name:'حفظ',exact:true}).click();
    const card=workspace.locator('article').filter({hasText:'خدمة معاينة السيارة'});
    await expect(card).toHaveAttribute('data-status','new');
    await workspace.getByRole('searchbox',{name:'بحث في أوامر الخدمة',exact:true}).fill('0500004321');
    await expect(card).toBeVisible();
    await card.getByRole('button',{name:'قيد التنفيذ',exact:true}).click();
    await expect(card).toHaveAttribute('data-status','in_progress');
    await card.getByRole('button',{name:'مكتمل',exact:true}).click();
    await expect(card).toHaveAttribute('data-status','completed');
    await expect(card.getByRole('button',{name:'تعديل',exact:true})).toHaveCount(0);
    await expect(card.getByRole('button',{name:'أرشفة',exact:true})).toHaveCount(0);
    await card.getByRole('button',{name:'عرض التفاصيل',exact:true}).click();
    await expect(form.locator('fieldset')).toHaveAttribute('disabled','');
    for(const control of await form.locator('input,select,textarea').all())await expect(control).toBeDisabled();
    await expect(form.getByRole('button',{name:'حفظ',exact:true})).toHaveCount(0);
    await form.getByRole('button',{name:'إغلاق',exact:true}).click();
    await page.setViewportSize({width:320,height:720});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    await captureScreenshot(page,{path:'work/merchant-service-orders-ar-mobile.png',fullPage:true});
    for(const [language,title] of [["en","Service orders"],["fr","Ordres de service"]]){
     await page.locator('.restaurantLanguageSelector select').selectOption(language);
     await expect(workspace.getByRole('heading',{name:title,exact:true})).toBeVisible();
     await expect(workspace).toHaveAttribute('dir','ltr');
     expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
     await captureScreenshot(page,{path:'work/merchant-service-orders-'+language+'-mobile.png',fullPage:true});
    }
   }finally{await context.close();}
  }
 }finally{await db.end();}
});
test.setTimeout(180000);




test("dashboard currencies follow the store and each order in three languages",async({browser})=>{
 const context=await browser.newContext();
 const db=await mysql.createConnection(process.env.DATABASE_URL);
 try{
  const slug='currency-overview-'+randomUUID().slice(0,8);
  const response=await context.request.post(origin+'/api/auth/register',{headers:{origin},data:{name:'Currency owner',storeName:'Currency store',slug,email:slug+'@test.example',password:'a-strong-test-password',activity:'watches',countryCode:'SA',currency:'SAR',region:'الرياض'}});
  expect(response.status(),await response.text()).toBe(201);
  const account=await response.json();
  await db.execute("UPDATE tenant_subscriptions SET plan_id='operations-enterprise' WHERE tenant_id=?",[account.tenant.id]);
  await db.execute("UPDATE tenant_business_profiles SET currency='USD' WHERE tenant_id=?",[account.tenant.id]);
  const page=await context.newPage();
  await page.route('**/api/restaurant/operations/overview**',async route=>{
   const response=await route.fetch(),body=await response.json();
   expect(response.status()).toBe(200);
   body.summary.sales=1234.5;body.summary.average=12.34;
   body.orders=[{id:'currency-preview',order_number:1,channel:'takeaway',status:'new',payment_status:'unpaid',total:9.75,currency:'EUR',dining_snapshot:null,party_size:null,items:[{name:'Currency preview',quantity:1}]}];
   await route.fulfill({response,json:body});
  });
  await page.goto(origin+'/restaurant?tenant='+account.tenant.id);
  for(const language of ['ar','en','fr']){
   await page.getByRole("combobox",{name:"اللغة / Language / Langue",exact:true}).selectOption(language);
   await expect(page.locator('.restaurantMetrics')).toContainText('1234.50 USD');
   await expect(page.locator('.restaurantMetrics')).toContainText('12.34 USD');
   await expect(page.locator('.restaurantOverviewGrid footer')).toContainText('1234.50 USD');
   await expect(page.locator('.restaurantOrders')).toContainText('9.75 EUR');
   await expect(page.locator('.restaurantContent')).not.toContainText('ر.س');
  }
 }finally{await Promise.all(context.pages().map(page=>page.unrouteAll({behavior:"wait"})));await db.end();await context.close();}
});

test('storefront carts support retail variants and laundry collection without leaving checkout',async({browser})=>{
 const db=await mysql.createConnection(process.env.DATABASE_URL);
 const merchant=await browser.newContext(),customer=await browser.newContext({viewport:{width:320,height:900}});
 merchant.setDefaultTimeout(15000);customer.setDefaultTimeout(15000);
 merchant.setDefaultNavigationTimeout(20000);customer.setDefaultNavigationTimeout(20000);
 try{
  const create=async(activity)=>{
   const slug='public-cart-'+activity+'-'+randomUUID().slice(0,8);
   const r=await merchant.request.post(origin+'/api/auth/register',{headers:{origin},data:{name:'Cart merchant',storeName:'Cart '+activity,slug,email:slug+'@test.example',password:'a-strong-test-password',activity,countryCode:'SA',currency:'SAR',region:'الرياض'}});
   expect(r.status(),await r.text()).toBe(201);const owner=await r.json();
   await db.execute("UPDATE tenant_subscriptions SET plan_id='operations-enterprise' WHERE tenant_id=?",[owner.tenant.id]);
   await db.execute("UPDATE tenant_business_profiles SET currency='USD' WHERE tenant_id=?",[owner.tenant.id]);
   const headers={origin,'x-foon-tenant':owner.tenant.id};
   const c=await merchant.request.post(origin+'/api/restaurant/activity-catalog',{headers,data:{kind:'category',name:'Cart category'}});expect(c.status()).toBe(201);
   const p=await merchant.request.post(origin+'/api/restaurant/activity-catalog',{headers,data:{kind:'product',categoryId:(await c.json()).id,name:'Cart item '+activity,price:7.25}});expect(p.status()).toBe(201);const id=(await p.json()).id;
   const u=await merchant.request.patch(origin+'/api/restaurant/activity-catalog',{headers,data:{kind:'product',id,stockQuantity:5}});expect(u.status()).toBe(200);
   return{slug,id,owner};
  };
  const grocery=await create('grocery'),group=randomUUID(),option=randomUUID();
  await db.execute("INSERT INTO catalog_option_groups(id,tenant_id,product_id,name_ar,required,min_select,max_select) VALUES (?,?,?,'Size',TRUE,1,1)",[group,grocery.owner.tenant.id,grocery.id]);
  await db.execute("INSERT INTO catalog_option_values(id,tenant_id,group_id,name_ar,price_delta,stock_quantity) VALUES (?,?,?,'Large',2.5,5)",[option,grocery.owner.tenant.id,group]);
  const colorGroup=randomUUID(),red=randomUUID(),blue=randomUUID();
  await db.execute("INSERT INTO catalog_option_groups(id,tenant_id,product_id,name_ar,required,min_select,max_select) VALUES (?,?,?,'Color',TRUE,1,1)",[colorGroup,grocery.owner.tenant.id,grocery.id]);
  await db.execute("INSERT INTO catalog_option_values(id,tenant_id,group_id,name_ar,price_delta,stock_quantity) VALUES (?,?,?,'Red',0,5),(?,?,?,'Blue',0,0)",[red,grocery.owner.tenant.id,colorGroup,blue,grocery.owner.tenant.id,colorGroup]);
  const variant=randomUUID(),productImage='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="blue"/></svg>'),variantImage='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/></svg>');
  await db.execute("INSERT INTO catalog_variants(id,tenant_id,product_id,combination_key,option_ids,sku,stock_quantity) VALUES (?,?,?,?,?,'SIZE-L',5)",[variant,grocery.owner.tenant.id,grocery.id,createHash('sha256').update([option,red].sort().join(':')).digest('hex'),JSON.stringify([option,red])]);
  await db.execute("INSERT INTO catalog_images(id,tenant_id,product_id,image_url,sort_order) VALUES (?,?,?,?,0)",[randomUUID(),grocery.owner.tenant.id,grocery.id,productImage]);
  await db.execute("INSERT INTO catalog_variant_images(id,tenant_id,product_id,variant_id,image_url,sort_order) VALUES (?,?,?,?,?,0)",[randomUUID(),grocery.owner.tenant.id,grocery.id,variant,variantImage]);
  const page=await customer.newPage();await page.goto(origin+'/'+grocery.slug);
  await page.getByRole('button',{name:'إضافة إلى السلة',exact:true}).click();
  const cart=page.locator('.foonStorefrontCart');await expect(cart.getByRole('button',{name:'تأكيد الإضافة',exact:true})).toBeDisabled();
  await cart.getByRole('button',{name:'إلغاء',exact:true}).click();
  await page.getByRole('button',{name:'تفاصيل Cart item grocery'}).click();
  const detail=page.getByRole('dialog',{name:'Cart item grocery'});
  await expect(detail.locator('.foonActivityDialogImage')).toHaveAttribute('src',productImage);
  await expect(detail.getByRole('button',{name:'إضافة إلى السلة',exact:true})).toBeDisabled();
  await expect(detail.getByRole('radio',{name:/Blue/})).toBeDisabled();
  await detail.getByRole('radio',{name:/Large/}).check();
  await expect(detail.getByRole('button',{name:'إضافة إلى السلة',exact:true})).toBeDisabled();
  await detail.getByRole('radio',{name:/Red/}).check();
  await expect(detail.locator('.foonActivityDialogImage')).toHaveAttribute('src',variantImage);
  await expect(detail.locator('.foonActivityDialogPurchase')).toContainText('9.75 USD');
  await detail.getByRole('button',{name:'إضافة إلى السلة',exact:true}).click();
  await expect(detail).toBeHidden();
  await expect(cart.getByRole('radio',{name:/Large/})).toBeChecked();
  await expect(cart.getByRole('radio',{name:/Red/})).toBeChecked();
  await expect(cart.getByRole('radio',{name:/Blue/})).toBeDisabled();
  await expect(cart.getByRole('button',{name:'تأكيد الإضافة',exact:true})).toBeEnabled();
  await cart.getByRole('button',{name:'تأكيد الإضافة',exact:true}).click();
  await cart.getByLabel('الكمية',{exact:true}).fill('2');await expect(cart).toContainText('19.50 USD');await expect(cart).toContainText('Large');
  for(const [language,title] of [['en','Shopping cart'],['fr','Panier'],['ar','سلة المشتريات']]){
   await customer.addCookies([{name:'foon_language',value:language,url:origin}]);await page.goto(origin+'/'+grocery.slug+'?q=Cart');
   await expect(page.getByRole('complementary',{name:title})).toBeVisible();await expect(cart).toContainText('19.50 USD');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   const bounds=await cart.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(320);
  }
  await cart.getByRole('button',{name:'إنشاء حساب سريع',exact:true}).click();
  const auth=cart.locator('.publicMenuInlineAuth form');await auth.getByLabel('الاسم',{exact:true}).fill('Cart customer');await auth.getByLabel('البريد الإلكتروني',{exact:true}).fill(randomUUID()+'@test.example');await auth.getByLabel('كلمة المرور',{exact:true}).fill('a-strong-test-password');
  await auth.getByRole('button',{name:'متابعة الطلب',exact:true}).click();await expect(cart.getByRole('button',{name:'تسجيل الطلب',exact:true})).toBeVisible();await expect(cart).toContainText('19.50 USD');
  const result=page.waitForResponse(r=>r.url().endsWith('/api/customer/orders')&&r.request().method()==='POST');await cart.getByRole('button',{name:'تسجيل الطلب',exact:true}).click();
  const response=await result;expect(response.status(),await response.text()).toBe(201);const order=await response.json();expect(order.total).toBe(19.5);expect(order.currency).toBe('USD');await expect(cart.getByRole('status')).toContainText('19.50 USD');
  const [[stock]]=await db.execute('SELECT stock_quantity FROM catalog_products WHERE id=?',[grocery.id]);expect(Number(stock.stock_quantity)).toBe(3);
  const [[optionStock]]=await db.execute('SELECT stock_quantity FROM catalog_option_values WHERE id=?',[option]);expect(Number(optionStock.stock_quantity)).toBe(3);
  const [[redStock]]=await db.execute('SELECT stock_quantity FROM catalog_option_values WHERE id=?',[red]);expect(Number(redStock.stock_quantity)).toBe(3);
  const [[variantStock]]=await db.execute('SELECT stock_quantity FROM catalog_variants WHERE id=?',[variant]);expect(Number(variantStock.stock_quantity)).toBe(3);
  const [[payment]]=await db.execute('SELECT payment_status FROM restaurant_orders WHERE id=?',[order.id]);expect(payment.payment_status).toBe('unpaid');
  const laundry=await create('laundry');await page.goto(origin+'/'+laundry.slug);await page.getByRole('button',{name:'إضافة الخدمة',exact:true}).click();await cart.getByRole('button',{name:'تأكيد الإضافة',exact:true}).click();await expect(cart.getByRole('heading',{name:/سلة الخدمات/})).toBeVisible();
  await cart.getByLabel(/^طريقة الاستلام/).selectOption('delivery');await cart.getByRole('button',{name:'متابعة بهذا الحساب',exact:true}).click();await expect(cart.getByRole('button',{name:'تسجيل الطلب',exact:true})).toBeDisabled();
  await cart.getByLabel(/^طريقة الاستلام/).selectOption('delivery');await cart.getByLabel('رقم التواصل',{exact:true}).fill('٠٥٠٠٠٠٤٣٢١');await expect(cart.getByLabel('رقم التواصل',{exact:true})).toHaveValue('0500004321');await expect(cart.locator('select[name="deliveryCountryCode"]')).toHaveCount(0);await cart.getByLabel(/^المدينة/).fill('الرياض');await cart.getByLabel(/^عنوان الاستلام والتوصيل/).fill('Test street, building 12');await cart.getByLabel('أؤكد أن عنوان التوصيل صحيح').check();
  const laundryResult=page.waitForResponse(r=>r.url().endsWith('/api/customer/orders')&&r.request().method()==='POST');await cart.getByRole('button',{name:'تسجيل الطلب',exact:true}).click();const delivery=await laundryResult;expect(delivery.status(),await delivery.text()).toBe(409);expect((await delivery.json()).code).toBe('DELIVERY_DRIVER_UNAVAILABLE');
  // Delivery is rejected until an active branch driver has been assigned.
  await page.reload();await page.getByRole('button',{name:'إضافة الخدمة',exact:true}).click();await cart.getByRole('button',{name:'تأكيد الإضافة',exact:true}).click();await cart.getByLabel(/^طريقة الاستلام/).selectOption('delivery');
  await expect(cart.getByLabel('رقم التواصل',{exact:true})).toHaveValue('');await expect(cart.getByLabel(/^عنوان الاستلام والتوصيل/)).toHaveValue('');
  const stored=await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('foon-public-cart:')).map(k=>sessionStorage.getItem(k)).join(' '));expect(stored).not.toContain('Test street');expect(stored).not.toContain('0500004321');
  await db.execute("UPDATE tenant_subscriptions SET status='cancelled' WHERE tenant_id=?",[grocery.owner.tenant.id]);await page.goto(origin+'/'+grocery.slug);await expect(page.locator('.foonStorefrontCart')).toHaveCount(0);await expect(page.getByRole('button',{name:'إضافة إلى السلة',exact:true})).toHaveCount(0);
  const unavailable=await customer.request.get(origin+'/api/customer/cart?store='+grocery.slug+'&product='+grocery.id);expect(unavailable.status()).toBe(403);
  const carwash=await create('carwash');await page.goto(origin+'/'+carwash.slug);await expect(page.locator('.foonStorefrontCart')).toHaveCount(0);await expect(page.getByRole('button',{name:'إضافة إلى السلة',exact:true})).toHaveCount(0);
 }catch(error){console.error('Customer cart browser failure:',error);throw error;}finally{await db.end();await Promise.all([merchant.close(),customer.close()]);}
});

test('customer and catalog interfaces use cookie locale without Arabic interface leakage',async({browser})=>{
 const db=await mysql.createConnection(process.env.DATABASE_URL);
 const context=await browser.newContext({viewport:{width:320,height:900}});context.setDefaultTimeout(15000);
 try{
  const slug='locale-notify-'+randomUUID().slice(0,8);
  const merchant=await context.request.post(origin+'/api/auth/register',{headers:{origin,cookie:'foon_language=en'},data:{name:'Owner',storeName:'Locale store',slug,email:slug+'@test.example',password:'a-strong-test-password',activity:'grocery',countryCode:'SA',currency:'SAR',region:'الرياض'}});expect(merchant.status(),await merchant.text()).toBe(201);
  const page=await context.newPage();
  for(const language of ['en','fr']){
   await context.addCookies([{name:'foon_language',value:language,url:origin}]);await page.goto(origin+'/restaurant');
   await expect(page.getByRole('heading',{name:language==='en'?'Overview':'Vue d’ensemble',exact:true})).toBeVisible();
   
   // Open the catalog with the actual navigation button, retaining an empty localStorage.
   await page.getByRole('button',{name:language==='en'?'Open business menu':'Ouvrir le menu de l’activité',exact:true}).click();
   await page.locator('.restaurantDrawer').getByRole('button',{name:language==='en'?'Products and categories':'Produits et catégories',exact:true}).click();
   await expect(page.getByRole('heading',{name:language==='en'?'Manage products':'Gérer les produits'})).toBeVisible();
   const text=await page.locator('.restaurantMain').innerText();expect(text.replace(/اللغة \/ Language \/ Langue|العربية/g,'')).not.toMatch(/[\u0600-\u06ff]/);
  }
  await context.clearCookies();await context.addCookies([{name:'foon_language',value:'en',url:origin}]);
  const customer=await context.request.post(origin+'/api/customer/register',{headers:{origin},data:{name:'Customer',email:slug+'-customer@test.example',password:'a-strong-test-password',storeSlug:slug}});expect(customer.status()).toBe(201);
  await page.goto(origin+'/customer');await expect(page.getByRole('heading',{name:'My orders',exact:true})).toBeVisible();
  const text=await page.locator('main').innerText();expect(text.replace(/اللغة \/ Language \/ Langue|العربية/g,'')).not.toMatch(/[\u0600-\u06ff]/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{await db.end();await context.close();}
});

test('merchant configures weight options and selling measurements in mobile dialogs',async({browser})=>{
 const db=await mysql.createConnection(process.env.DATABASE_URL),context=await browser.newContext({viewport:{width:320,height:900}});
 try{
  const slug='measure-'+randomUUID().slice(0,8),r=await context.request.post(origin+'/api/auth/register',{headers:{origin},data:{name:'Measure owner',storeName:'Measures',slug,email:slug+'@test.example',password:'a-strong-test-password',activity:'grocery',countryCode:'SA',currency:'SAR',region:'الرياض'}});expect(r.status()).toBe(201);const owner=await r.json();
  await db.execute("UPDATE tenant_subscriptions SET plan_id='operations-enterprise' WHERE tenant_id=?",[owner.tenant.id]);
  const headers={origin,'x-foon-tenant':owner.tenant.id},c=await context.request.post(origin+'/api/restaurant/activity-catalog',{headers,data:{kind:'category',name:'Measures'}}),p=await context.request.post(origin+'/api/restaurant/activity-catalog',{headers,data:{kind:'product',name:'Rice pack',price:10,categoryId:(await c.json()).id}});expect(p.status()).toBe(201);const product=(await p.json()).id;
  await context.addCookies([{name:'foon_language',value:'en',url:origin}]);const page=await context.newPage();await page.goto(origin+'/restaurant');await page.getByRole('button',{name:'Open business menu',exact:true}).click();await page.locator('.restaurantDrawer').getByRole('button',{name:'Products and categories',exact:true}).click();
  await page.getByRole('button',{name:'Edit details & measurements',exact:true}).click();let dialog=page.locator('dialog[open]');await dialog.getByLabel('Selling unit',{exact:true}).selectOption('kg');await dialog.getByLabel('Weight in kg',{exact:true}).fill('0.5');await dialog.getByLabel('Allow measured quantity to 0.001 for weight, volume and length units').check();await dialog.getByLabel('Width in cm',{exact:true}).fill('12');await dialog.getByRole('button',{name:'Save',exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.getByRole('button',{name:'Variants & selling units',exact:true}).click();dialog=page.locator('dialog[open]');await dialog.getByLabel('Activity template').selectOption('3');await dialog.getByRole('button',{name:'Add group',exact:true}).click();await expect(dialog.getByLabel('Group',{exact:true})).toBeVisible();await dialog.getByLabel('Arabic value (e.g. 1 kg)').fill('نصف كيلو');await dialog.getByLabel('English',{exact:true}).last().fill('0.5 kg');await dialog.getByLabel('Français',{exact:true}).last().fill('0.5 kg');await dialog.getByLabel('Price adjustment').fill('2');await dialog.getByLabel('Pack stock (blank = unlimited)').fill('4');await dialog.getByRole('button',{name:'Add value',exact:true}).click();await expect(dialog).toContainText('نصف كيلو');
  const box=await dialog.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320);expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await dialog.getByRole('radio',{name:'نصف كيلو',exact:true}).check();await dialog.getByLabel('SKU',{exact:true}).fill('HALF-KG');await dialog.getByLabel('Combination stock (blank = unlimited)',{exact:true}).fill('0.375');await dialog.getByRole('button',{name:'Add combination',exact:true}).click();await expect(dialog).toContainText('HALF-KG');await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.goto(origin+'/'+slug);await page.getByRole('button',{name:'Add to cart',exact:true}).click();await expect(page.getByRole('radio',{name:/0.5 kg/})).toBeVisible();await page.getByRole('radio',{name:/0.5 kg/}).check();await page.getByRole('button',{name:'Confirm addition',exact:true}).click();await expect(page.locator('.foonStorefrontCart')).toContainText('4.50');await expect(page.getByLabel('Quantity (kg)',{exact:true})).toHaveValue('0.375');await page.getByLabel('Quantity (kg)',{exact:true}).fill('0.125');await expect(page.locator('.foonStorefrontCart')).toContainText('1.50');
  const [[saved]]=await db.execute('SELECT attributes FROM catalog_products WHERE id=?',[product]);const attributes=typeof saved.attributes==='string'?JSON.parse(saved.attributes):saved.attributes;expect(attributes.measurements.weightKg).toBe(0.5);expect(attributes.measurements.quantityMode).toBe('measured');
  const customer=await context.request.post(origin+'/api/customer/register',{headers:{origin},data:{name:'Measured customer',email:randomUUID()+'@test.example',password:'a-strong-test-password',storeSlug:slug}});expect(customer.status()).toBe(201);await page.reload();await expect(page.getByLabel('Quantity (kg)',{exact:true})).toHaveValue('0.125');const placed=page.waitForResponse(r=>r.url().endsWith('/api/customer/orders')&&r.request().method()==='POST');await page.getByRole('button',{name:'Place order',exact:true}).click();const order=await placed;expect(order.status(),await order.text()).toBe(201);expect((await order.json()).total).toBe(1.5);const [[variant]]=await db.execute('SELECT stock_quantity FROM catalog_variants WHERE product_id=?',[product]);expect(Number(variant.stock_quantity)).toBe(0.25);
 }finally{await db.end();await context.close()}
});


test("existing accounts create activity-specific businesses without administrator approval",async({browser})=>{
 for(const [locale,activity] of [["ar","cafe"],["en","clothing"],["fr","salon"]]){
  const context=await browser.newContext({viewport:{width:320,height:740}});
  try{
   await context.addCookies([{name:"foon_language",value:locale,url:origin}]);
   const slug="self-service-"+randomUUID().slice(0,8);
   const registered=await context.request.post(origin+"/api/auth/register",{headers:{origin},data:{name:"Owner",storeName:"Original business",email:slug+"@test.example",password:"synthetic-long-password",slug,activity:"grocery",countryCode:"SA",currency:"SAR",region:"الرياض"}});expect(registered.status()).toBe(201);
   const page=await context.newPage();await page.goto(origin+"/restaurant/register");
   await page.locator('select[name="activity"]').selectOption(activity);
   await page.locator('input[name="name"]').fill("Additional business");await page.locator('input[name="slug"]').fill(slug+"-new");
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
   const response=page.waitForResponse(r=>r.url().endsWith("/api/restaurant/onboard")&&r.request().method()==="POST");
   await page.locator('button[type="submit"],form button:not([type])').click();const result=await response;expect(result.status()).toBe(201);const body=await result.json();expect(body.activity).toBe(activity);
   const routeSlug=({clothing:"fashion",automotive:"car",publicworks:"contracting"})[activity]??activity;
   await expect(page).toHaveURL(origin+"/"+routeSlug);await expect(page.locator('main')).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  }finally{await context.close();}
 }
});

test('administrator customizes one activity without changing another activity in the same plan',async({browser})=>{
 const context=await browser.newContext({viewport:{width:320,height:740}}),db=await mysql.createConnection(process.env.DATABASE_URL);
 try{
  await context.addCookies([{name:'foon_language',value:'en',url:origin}]);const slug='plan-ui-'+randomUUID().slice(0,8);
  const registered=await context.request.post(origin+'/api/auth/register',{headers:{origin},data:{name:'Admin test',email:slug+'@test.example',password:'synthetic-long-password',storeName:slug,slug,activity:'grocery',countryCode:'SA',currency:'SAR',region:'الرياض'}});expect(registered.status()).toBe(201);const account=await registered.json();
  await db.execute("INSERT INTO platform_admins(user_id,role,enabled) VALUES (?,'admin',TRUE)",[account.user.id]);
  const plan=randomUUID(),planName='Activity isolation '+slug;await db.execute('INSERT INTO package_plans(id,code,name_ar,name_en,name_fr) VALUES (?,?,?,?,?)',[plan,slug,'اختبار النشاط',planName,'Test activité']);
  await db.execute("INSERT INTO package_plan_features(plan_id,feature_key,enabled,limit_value) VALUES (?,'digital_menu',TRUE,8)",[plan]);
  const page=await context.newPage();await page.goto(origin+'/admin/plans');
  const adminTheme=page.getByRole("combobox",{name:"Appearance"});
  await expect(adminTheme).toHaveValue("system");
  await adminTheme.selectOption("dark");
  await expect(page.locator(".adminShell")).toHaveAttribute("data-theme","dark");
  await adminTheme.selectOption("system");
  await page.emulateMedia({colorScheme:"dark"});
  await expect(page.locator(".adminShell")).toHaveAttribute("data-theme","dark");
  await page.emulateMedia({colorScheme:"light"});
  await expect(page.locator(".adminShell")).toHaveAttribute("data-theme","light");
  await adminTheme.selectOption("light");const card=page.locator('.adminPlanCatalogCard').filter({has:page.getByText(planName,{exact:true})});
  const details=card.locator('details').filter({has:page.getByText('Plan features and limits by activity',{exact:true})});await details.locator('summary').click();await details.locator('select').selectOption('grocery');
  const row=details.locator('small[dir="ltr"]').filter({hasText:'digital_menu'}).locator('..');await expect(row.getByRole('spinbutton')).toHaveValue('8');
  await row.getByRole('spinbutton').fill('3');await row.getByRole('spinbutton').press('Tab');await expect(row.getByText(/Customized/)).toBeVisible();
  await details.locator('select').selectOption('clothing');await expect(row.getByRole('spinbutton')).toHaveValue('8');
  await details.locator('select').selectOption('grocery');await expect(row.getByRole('spinbutton')).toHaveValue('3');
  await row.getByRole('button',{name:'Restore shared default',exact:true}).click();await expect(row.getByRole('spinbutton')).toHaveValue('8');await expect(row.getByText(/Inherited/)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 }finally{await db.end();await context.close();}
});

test('all activity storefront templates retain distinct direction and responsive cards',async({browser})=>{
 test.setTimeout(180000);
 const activities=['cafe','sweets','grocery','clothing','perfume','accessories','watches','gifts','ecommerce','carwash','laundry','automotive','salon','publicworks'];
 const merchant=await browser.newContext(),customer=await browser.newContext({viewport:{width:320,height:850}});
 const db=await mysql.createConnection(process.env.DATABASE_URL);
 try{
  const page=await customer.newPage();
  for(const activity of activities){
   const slug='storefront-visual-'+activity+'-'+randomUUID().slice(0,8);
   const registered=await merchant.request.post(origin+'/api/auth/register',{headers:{origin},data:{name:'Visual merchant',storeName:'Visual '+activity,slug,email:slug+'@test.example',password:'a-strong-test-password',activity,countryCode:'SA',currency:'SAR',region:'الرياض'}});
   expect(registered.status(),await registered.text()).toBe(201);const account=await registered.json();
   await db.execute("UPDATE tenant_subscriptions SET plan_id='operations-enterprise' WHERE tenant_id=?",[account.tenant.id]);
   const headers={origin,'x-foon-tenant':account.tenant.id};
   const category=await merchant.request.post(origin+'/api/restaurant/activity-catalog',{headers,data:{kind:'category',name:'Visual category'}});expect(category.status(),await category.text()).toBe(201);
   const product=await merchant.request.post(origin+'/api/restaurant/activity-catalog',{headers,data:{kind:'product',categoryId:(await category.json()).id,name:'Responsive visual product',price:12.5}});expect(product.status(),await product.text()).toBe(201);
   const settings=await merchant.request.get(origin+'/api/restaurant/activity-template',{headers});expect(settings.status(),await settings.text()).toBe(200);
   const choices=(await settings.json()).templates;expect(choices.length,activity).toBe(2);
   for(let i=0;i<choices.length;i++){
    const template=choices[i];const saved=await merchant.request.put(origin+'/api/restaurant/activity-template',{headers,data:{template}});expect(saved.status(),await saved.text()).toBe(200);
    const language=activity==='clothing'?'en':activity==='salon'?'fr':'ar';
    await customer.addCookies([{name:'foon_language',value:language,url:origin}]);
    for(const width of [320,1440]){
     await page.setViewportSize({width,height:width===320?850:1000});
     await page.goto(origin+'/'+slug);
     const storefront=page.locator('.foonActivityStorefront');
     await expect(storefront).toHaveAttribute('data-activity',activity);
     await expect(storefront).toHaveAttribute('data-template',template);
     await expect(storefront).toHaveAttribute('dir',language==='ar'?'rtl':'ltr');
     await expect(page.getByRole('heading',{name:'Responsive visual product',exact:true})).toBeVisible();
     expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),activity+'/'+template+'/'+width).toBe(true);
     const dock=page.locator('.foonActivityMobileDock');
     if(width===320){
      await expect(dock).toBeVisible();
      await expect(dock.locator('a[href="#activity-products"]')).toHaveCount(1);
      await expect(dock.locator('a[href="#activity-categories"]')).toHaveCount(1);
       await expect(page.locator('.foonActivityHeaderNav')).toBeHidden();
       await expect(page.locator('.foonActivityBusinessDetails')).toHaveCount(1);
       await expect(page.locator('.foonActivityBusinessDetails summary')).toBeVisible();
      const dockBounds=await dock.boundingBox();expect(dockBounds).not.toBeNull();expect(dockBounds.x).toBeGreaterThanOrEqual(-1);expect(dockBounds.x+dockBounds.width).toBeLessThanOrEqual(width+1);expect(dockBounds.y+dockBounds.height).toBeLessThanOrEqual(851);
      const actions=await page.locator('.foonActivityHeaderActions').evaluate(el=>Array.from(el.querySelectorAll(':scope > button, :scope > label')).map(child=>{const r=child.getBoundingClientRect();return {y:r.y}}));expect(actions.length).toBe(2);expect(Math.max(...actions.map(r=>r.y))-Math.min(...actions.map(r=>r.y))).toBeLessThanOrEqual(2);
     }else await expect(dock).toBeHidden();
     const imageSize=await page.locator('.foonActivityProductMedia').first().evaluate(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height}});expect(Math.abs(imageSize.width-imageSize.height)).toBeLessThanOrEqual(1);
     if(activity==='cafe'&&i===0&&width===320){
      const toggle=page.locator('.foonActivityStorefront .foonStorefrontThemeToggle');
      await toggle.click();await expect(storefront).toHaveAttribute('data-color-mode','dark');
      await page.reload();await expect(storefront).toHaveAttribute('data-color-mode','dark');
      await toggle.click();await expect(storefront).toHaveAttribute('data-color-mode','light');
     }
     const bounds=await page.locator('.foonActivityProduct').first().boundingBox();expect(bounds).not.toBeNull();expect(bounds.x,activity+'/'+template+'/'+width).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width,activity+'/'+template+'/'+width).toBeLessThanOrEqual(width+1);expect(bounds.width,activity+'/'+template+'/'+width).toBeGreaterThan(100);
    }
   }
  }
 }finally{await db.end();await Promise.all([merchant.close(),customer.close()]);}
});

test("guest service request drafts remain on storefront through registration and login across businesses",async({browser})=>{
 const db=await mysql.createConnection(process.env.DATABASE_URL);
 const merchant=await browser.newContext(),guestOne=await browser.newContext(),guestTwo=await browser.newContext();
 try{
  const email="journey-"+randomUUID()+"@test.example",password="a-strong-test-password";
  let registeredCustomer="";
  for(const [index,activity,action,requestType] of [[0,"publicworks","Request a quotation","quote"],[1,"carwash","Request appointment","appointment"]]){
   const slug="journey-"+activity+"-"+randomUUID().slice(0,8);
   const response=await merchant.request.post(origin+"/api/auth/register",{headers:{origin},data:{name:"Journey merchant",storeName:"Journey "+activity,slug,email:slug+"@test.example",password,activity,countryCode:"SA",currency:"SAR",region:"الرياض"}});
   expect(response.status(),await response.text()).toBe(201);
   const owner=await response.json();
   await db.execute("UPDATE tenant_subscriptions SET plan_id='operations-enterprise' WHERE tenant_id=?",[owner.tenant.id]);
   const headers={origin,"x-foon-tenant":owner.tenant.id};
   const cat=await merchant.request.post(origin+"/api/restaurant/activity-catalog",{headers,data:{kind:"category",name:"Journey category"}});expect(cat.status(),await cat.text()).toBe(201);
   const product=await merchant.request.post(origin+"/api/restaurant/activity-catalog",{headers,data:{kind:"product",categoryId:(await cat.json()).id,name:"Journey service "+activity,price:15}});expect(product.status(),await product.text()).toBe(201);
   const serviceId=(await product.json()).id;
   const guest=index===0?guestOne:guestTwo,page=await guest.newPage();
   await guest.addCookies([{name:"foon_language",value:"en",url:origin}]);
   const unauthorized=await guest.request.post(origin+"/api/customer/service-requests",{headers:{origin},data:{storeSlug:slug,serviceId,requestType,phone:"+966501234567",notes:"Draft kept",requestKey:randomUUID(),...(requestType==="appointment"?{scheduledAt:new Date(Date.now()+48*3600000).toISOString()}:{})}});
   expect(unauthorized.status()).toBe(401);
   await page.goto(origin+"/"+slug);
   const appointmentAvailable=activity==="carwash"&&await page.getByRole("button",{name:"Request appointment",exact:true}).count()>0;
   const displayedAction=activity==="carwash"&&!appointmentAvailable?"Ask about this service":action;
   const displayedType=activity==="carwash"&&!appointmentAvailable?"inquiry":requestType;
   await page.getByRole("button",{name:displayedAction,exact:true}).click();
   const panel=page.locator(".foonServiceRequestForm").first();
   const form=panel.locator(".foonServiceRequestJourney > form");
   await form.getByLabel("Contact phone").fill("+966501234567");
   await form.getByLabel("Request details").fill("Customer journey draft "+activity);
   if(displayedType==="appointment")await form.getByLabel("Preferred appointment").fill(new Date(Date.now()+48*3600000).toISOString().slice(0,16));
   await expect(form.getByRole("button",{name:"Send request"})).toBeDisabled();
   const inline=panel.locator(".publicMenuInlineAuth");
   await expect(inline).toContainText("Continue your service request without leaving this page");
   if(index===0){
    await inline.getByRole("button",{name:"Quick sign up",exact:true}).click();
    await inline.getByLabel("Name",{exact:true}).fill("Journey customer");
    await inline.getByLabel("Email",{exact:true}).fill(email);
    await inline.getByLabel("Password",{exact:true}).fill(password);
   }else{
    await inline.getByLabel("Email",{exact:true}).fill(email);
    await inline.getByLabel("Password",{exact:true}).fill(password);
   }
   await inline.getByRole("button",{name:"Continue request",exact:true}).click();
   await expect(inline).toHaveCount(0);
   await expect(form.getByLabel("Contact phone")).toHaveValue("+966501234567");
   await expect(form.getByLabel("Request details")).toHaveValue("Customer journey draft "+activity);
   await expect(form.getByRole("button",{name:"Send request"})).toBeEnabled();
   expect(new URL(page.url()).pathname).toBe("/"+slug);
   const created=page.waitForResponse(r=>r.url().endsWith("/api/customer/service-requests")&&r.request().method()==="POST");
   await form.getByRole("button",{name:"Send request"}).click();
   const sent=await created;expect(sent.status(),await sent.text()).toBe(201);
   const result=await sent.json();
   const [[stored]]=await db.execute("SELECT tenant_id,status,JSON_UNQUOTE(JSON_EXTRACT(data,'$.customerUserId')) AS customerId,JSON_UNQUOTE(JSON_EXTRACT(data,'$.notes')) AS notes FROM restaurant_resources WHERE id=? AND kind='service_customer_request'",[result.id]);
   expect(stored.tenant_id).toBe(owner.tenant.id);expect(stored.status).toBe("pending");expect(stored.notes).toBe("Customer journey draft "+activity);
   if(index===0)registeredCustomer=String(stored.customerId);
   else expect(String(stored.customerId)).toBe(registeredCustomer);
   const [[link]]=await db.execute("SELECT user_id FROM tenant_customers WHERE tenant_id=? AND user_id=?",[owner.tenant.id,registeredCustomer]);expect(link.user_id).toBe(registeredCustomer);
   await expect(page.getByRole("heading",{name:"Track service requests"})).toBeVisible();
   await expect(page.locator(".foonServiceRequestHistory")).toContainText("Journey service "+activity);
   await page.close();
  }
 }finally{await Promise.all([merchant.close(),guestOne.close(),guestTwo.close()]);await db.end();}
});
