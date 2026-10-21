import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID,randomBytes,createHmac,scryptSync} from "node:crypto";
import {spawn} from "node:child_process";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import {countryRegions} from "../lib/tenant/country-catalog.ts";
import {startCustomerPayment} from "../lib/payments/customer-checkout.ts";

test("customer checkout persists before HTTP, isolates ownership, survives retries and completes through authenticated sandbox webhooks",async()=>{
 const url=new URL(process.env.DATABASE_URL||"");assert.equal(url.hostname,"127.0.0.1");assert.equal(url.pathname,"/foon_migration_test");
 const pool=mysql.createPool(url.href),local="http://127.0.0.1:3121",app="https://checkout.test.example";
 const vault=randomBytes(32).toString("base64");process.env.FOON_PAYMENT_VAULT_KEY=vault;
 const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p","3121"],{env:{...process.env,APP_URL:app},stdio:["ignore","pipe","pipe"]});
 let output="";server.stdout.on("data",c=>output+=c);server.stderr.on("data",c=>output+=c);
 try{
  let ready=false;for(let i=0;i<60;i++){try{await fetch(local+"/login",{signal:AbortSignal.timeout(2000)});ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}assert.ok(ready,output);
  const suffix=randomUUID().slice(0,8),password="synthetic-long-password-2026";
  const r=await fetch(local+"/api/auth/register",{method:"POST",headers:{origin:app,"content-type":"application/json"},body:JSON.stringify({email:"checkout-owner-"+suffix+"@test.example",password,name:"Owner",storeName:"Checkout "+suffix,slug:"checkout-"+suffix,activity:"grocery",countryCode:"SA",currency:"SAR",region:countryRegions.SA[0]})});
  assert.equal(r.status,201,await r.clone().text());const owner=await r.json(),tenant=owner.tenant.id,ownerCookie=r.headers.get("set-cookie").split(";")[0];
  const [[branch]]=await pool.execute("SELECT id FROM branches WHERE tenant_id=? LIMIT 1",[tenant]);
  const customer=randomUUID(),email="checkout-customer-"+suffix+"@test.example";
  await pool.execute("INSERT INTO users(id,email,password_hash,display_name,status) VALUES (?,?,?,'Synthetic Customer','active')",[customer,email,await bcrypt.hash(password,10)]);
  await pool.execute("INSERT INTO tenant_customers(tenant_id,user_id) VALUES (?,?)",[tenant,customer]);
  const login=await fetch(local+"/api/auth/login",{method:"POST",headers:{origin:app,"content-type":"application/json"},body:JSON.stringify({email,password})});assert.equal(login.status,200);
  const cookie=login.headers.get("set-cookie").split(";")[0],headers={cookie:ownerCookie,origin:app,"content-type":"application/json","x-foon-tenant":tenant};
  const payload={branch_id:null,provider:"tap",mode:"test",enabled:true,currency:"SAR",merchant_reference:"",public_key:"pk_test_synthetic",version:null,credentials:{secret_key:"sk_test_synthetic"}};
  const put=body=>fetch(local+"/api/restaurant/payments/settings",{method:"PUT",headers,body:JSON.stringify(body)});
  const get=async()=>(await (await fetch(local+"/api/restaurant/payments/settings",{headers})).json()).settings;
  const configured=await put(payload);assert.equal(configured.status,200,await configured.clone().text());
  assert.equal((await get())[0].status,"test_checkout_enabled");
  assert.equal((await put({...payload,mode:"live",public_key:"pk_live_synthetic",credentials:{secret_key:"sk_live_synthetic"},version:1})).status,409,"live checkout remains disabled");
  async function order(branchId=branch.id,total=12.34){const id=randomUUID();await pool.execute("INSERT INTO restaurant_orders(id,tenant_id,branch_id,created_by,customer_user_id,channel,status,payment_status,subtotal,discount,total,currency) VALUES (?,?,?,?,?,'takeaway','new','unpaid',?,0,?,'SAR')",[id,tenant,branchId,owner.user.id,customer,total,total]);return id;}
  const request=(orderId,body={orderId},auth=cookie,origin=app)=>fetch(local+"/api/customer/payments",{method:"POST",headers:{cookie:auth,origin,"content-type":"application/json"},body:JSON.stringify(body)});
  const invalidKey=await put({...payload,version:1,credentials:{secret_key:"sk_test_invalid\r\nheader"}});
  assert.equal(invalidKey.status,409);assert.equal((await invalidKey.json()).code,"PAYMENT_SETUP_INCOMPLETE");
  const zero=await order(branch.id,0);
  await assert.rejects(()=>startCustomerPayment(pool,{userId:customer,orderId:zero,appUrl:app},()=>assert.fail("zero amount must not reach Tap")),/CHECKOUT_AMOUNT_INVALID/);
  assert.equal((await pool.execute("SELECT COUNT(*) AS n FROM tenant_payment_checkouts WHERE order_id=?",[zero]))[0][0].n,0);
  const main=await order();
  assert.equal((await request(main,{orderId:main},"")).status,401);
  assert.equal((await request(main,{orderId:main},cookie,"https://foreign.example")).status,403);
  assert.equal((await request(main,{orderId:main,amount:1})).status,400);
  assert.equal((await request(main,{orderId:main},ownerCookie)).status,404,"staff/owner is not the order customer");
  assert.equal((await request(randomUUID())).status,404);
  let network=0;
  async function gateway(_url,options){
   network++;const input=JSON.parse(options.body);
   const [[record]]=await pool.execute("SELECT * FROM tenant_payment_checkouts WHERE id=?",[input.reference.idempotent]);
   assert.ok(record,"initiation must already be committed before provider HTTP");assert.equal(record.amount_minor,1234);
   assert.equal(input.amount,12.34);assert.equal(input.source.id,"src_all");
   return new Response(JSON.stringify({id:"chg_"+record.id,object:"charge",live_mode:false,status:"INITIATED",amount:12.34,currency:"SAR",transaction:{url:"https://sandbox.payments.tap.company/checkout/"+record.id}}));
  }
  const start=id=>startCustomerPayment(pool,{userId:customer,orderId:id,appUrl:app},gateway);
  const [first,second]=await Promise.all([start(main),start(main)]);assert.equal(first.url,second.url);
  const [[count]]=await pool.execute("SELECT COUNT(*) AS n FROM tenant_payment_attempts WHERE tenant_id=? AND order_id=?",[tenant,main]);assert.equal(count.n,1);
  const before=network;const resumed=await request(main);assert.equal(resumed.status,200);assert.equal((await resumed.json()).url,first.url);assert.equal(network,before);
  assert.equal((await put({...payload,version:1,credentials:{}})).status,409,"pending checkout locks configuration");
  const override=await put({...payload,branch_id:branch.id,version:null,enabled:false,credentials:{}});
  assert.equal(override.status,409,"branch override cannot bypass an unresolved tenant checkout");
  const [[checkout]]=await pool.execute("SELECT * FROM tenant_payment_checkouts WHERE tenant_id=? AND order_id=?",[tenant,main]);
  const endpoint=(await get())[0].webhook.url.replace(app,local);
  async function webhook(record){
   const event={id:record.provider_payment_id,object:"charge",live_mode:false,status:"CAPTURED",amount:12.34,currency:"SAR",reference:{gateway:"gw",payment:"ref"},transaction:{created:"12345"}};
   const text="x_id"+event.id+"x_amount12.34x_currencySARx_gateway_referencegwx_payment_referencerefx_statusCAPTUREDx_created12345";
   const result=await fetch(endpoint,{method:"POST",headers:{hashstring:createHmac("sha256","sk_test_synthetic").update(text).digest("hex"),"content-type":"application/json"},body:JSON.stringify(event)});
   assert.equal(result.status,200,await result.clone().text());
  }
  await webhook(checkout);
  const completed=await request(main);assert.equal(completed.status,200);assert.equal((await completed.json()).state,"test_completed");
  const [[actual]]=await pool.execute("SELECT payment_status,version FROM restaurant_orders WHERE id=?",[main]);assert.equal(actual.payment_status,"unpaid");
  await webhook(checkout);
  assert.equal((await pool.execute("SELECT version FROM restaurant_orders WHERE id=?",[main]))[0][0].version,actual.version);
  const dashboard=await fetch(local+"/customer",{headers:{cookie}});assert.equal(dashboard.status,200);assert.ok((await dashboard.text()).includes("customerPaymentAction"));
  // A timeout preserves the same durable key when the customer retries.
  const uncertain=await order();let key="";
  await assert.rejects(()=>startCustomerPayment(pool,{userId:customer,orderId:uncertain,appUrl:app},async(_u,opts)=>{key=JSON.parse(opts.body).reference.idempotent;throw Error("synthetic timeout");}),/CHECKOUT_UNCERTAIN/);
  assert.equal((await put({...payload,version:1,credentials:{}})).status,409);
  const recovered=await startCustomerPayment(pool,{userId:customer,orderId:uncertain,appUrl:app},async(u,opts)=>{assert.equal(JSON.parse(opts.body).reference.idempotent,key);return gateway(u,opts);});assert.equal(recovered.state,"ready");
  await webhook((await pool.execute("SELECT * FROM tenant_payment_checkouts WHERE id=?",[key]))[0][0]);
  // A callback can beat the HTTP response; registration must reconcile it.
  const early=await order();
  const earlyResult=await startCustomerPayment(pool,{userId:customer,orderId:early,appUrl:app},async(u,opts)=>{const id=JSON.parse(opts.body).reference.idempotent;await webhook({provider_payment_id:"chg_"+id});return gateway(u,opts);});
  assert.equal(earlyResult.state,"test_completed");assert.equal((await pool.execute("SELECT payment_status FROM restaurant_orders WHERE id=?",[early]))[0][0].payment_status,"unpaid");
  // Completed sandbox attempts no longer hold the merchant configuration lock.
  const update=await put({...payload,version:1,credentials:{}});assert.equal(update.status,200,await update.clone().text());
  const secondBranch=randomUUID();await pool.execute("INSERT INTO branches(id,tenant_id,name,slug) VALUES (?,?,'Other','other')",[secondBranch,tenant]);
  // A second branch cannot change shared merchant settings until its owner
  // initializes and unlocks the branch PIN for this authenticated session.
  const location={deliveryMode:"manual",latitude:null,longitude:null,radiusKm:null,outsideMessage:"Synthetic branch coverage",googleAnalyticsId:"",facebookPixelId:"",aiAssistantRequested:false};
  const saveLocation=()=>fetch(local+"/api/restaurant/location-settings",{method:"PUT",headers,body:JSON.stringify(location)});
  const locationLocked=await saveLocation();
  assert.equal(locationLocked.status,409,"tenant-wide location changes require secondary branch PIN setup");
  assert.equal((await locationLocked.json()).code,"BRANCH_PIN_SETUP_REQUIRED");
  const denied=await put({...payload,branch_id:secondBranch,enabled:false,credentials:{},public_key:"",version:null});
  assert.equal(denied.status,403,"locked additional branches must reject merchant mutations");
  const pin="726391",salt=randomBytes(16).toString("hex");
  await pool.execute("UPDATE branches SET pin_salt=?,pin_hash=? WHERE id=?",[salt,scryptSync(pin,salt,32).toString("hex"),secondBranch]);
  const opened=await fetch(local+"/api/restaurant/branches/unlock",{method:"POST",headers:{cookie:ownerCookie,origin:app,"content-type":"application/json"},body:JSON.stringify({tenantId:tenant,branchId:secondBranch,pin})});
  assert.equal(opened.status,200,await opened.clone().text());
   assert.equal((await opened.clone().json()).expiresInSeconds,900,"secondary branch must be unlocked, not treated as primary");
   const [[pinGrant]]=await pool.execute("SELECT a.unlocked_until,UTC_TIMESTAMP() AS db_now FROM branch_pin_access a JOIN auth_sessions s ON s.id=a.auth_session_id AND s.user_id=? AND s.expires_at>UTC_TIMESTAMP() WHERE a.tenant_id=? AND a.branch_id=? AND a.unlocked_until>UTC_TIMESTAMP() LIMIT 1",[owner.user.id,tenant,secondBranch]);
   assert.ok(pinGrant,"branch PIN grant must be visible to the merchant API");
  const savedLocation=await saveLocation();assert.equal(savedLocation.status,200,await savedLocation.clone().text());
  const [[savedZone]]=await pool.execute("SELECT outside_message FROM tenant_location_settings WHERE tenant_id=?",[tenant]);
  assert.equal(savedZone.outside_message,location.outsideMessage);
  const branchConfig=await put({...payload,branch_id:secondBranch,enabled:false,credentials:{},public_key:"",version:null});assert.equal(branchConfig.status,200,await branchConfig.clone().text());
  const disabled=await order(secondBranch);await assert.rejects(()=>start(disabled),/CHECKOUT_NOT_ENABLED/);
  // An altered order during provider creation is retained for review, without exposing a URL.
  const changed=await order();
  await assert.rejects(()=>startCustomerPayment(pool,{userId:customer,orderId:changed,appUrl:app},async(u,opts)=>{const response=await gateway(u,opts);await pool.execute("UPDATE restaurant_orders SET total=15 WHERE id=?",[changed]);return response;}),/CHECKOUT_REVIEW_REQUIRED/);
  const [[review]]=await pool.execute("SELECT state,provider_payment_id,hosted_url FROM tenant_payment_checkouts WHERE order_id=?",[changed]);assert.equal(review.state,"review");assert.ok(review.provider_payment_id);assert.equal(review.hosted_url,null);
  await assert.rejects(()=>start(changed),/CHECKOUT_REVIEW_REQUIRED/);
  // Do not retry indefinitely after provider idempotency may have expired.
  const aged=await order();
  await assert.rejects(()=>startCustomerPayment(pool,{userId:customer,orderId:aged,appUrl:app},async()=>{throw Error("synthetic timeout");}),/CHECKOUT_UNCERTAIN/);
  await pool.execute("UPDATE tenant_payment_checkouts SET created_at=DATE_SUB(NOW(),INTERVAL 16 MINUTE) WHERE order_id=?",[aged]);
  await assert.rejects(()=>startCustomerPayment(pool,{userId:customer,orderId:aged,appUrl:app},()=>assert.fail("expired uncertain creation must not contact Tap")),/CHECKOUT_REVIEW_REQUIRED/);
  // Credentials and personal data are absent from the durable initiation record.
  assert.ok(!JSON.stringify(checkout).includes("sk_test"));assert.ok(!JSON.stringify(checkout).includes(email));
 }finally{server.kill();await pool.end();delete process.env.FOON_PAYMENT_VAULT_KEY;}
});
