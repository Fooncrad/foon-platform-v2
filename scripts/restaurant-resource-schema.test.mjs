import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validateResource,resourceModules} from "./restaurant-resource-schema.mjs";
test("resource validation rejects unknown keys, nonfinite prices and unsafe asset URLs",()=>{
 assert.throws(()=>validateResource("__proto__",{name:"X",status:"active"}));
 for(const price of [NaN,Infinity,-1])assert.throws(()=>validateResource("menu",{name:"X",status:"active",data:{price}}));
 assert.throws(()=>validateResource("menu",{name:"X",status:"active",data:{price:10,tenant_id:"foreign"}}));
 for(const imageUrl of ["javascript:alert(1)","http://example.com/image.png","https://user:secret@example.com/image.png"])assert.throws(()=>validateResource("menu",{name:"X",status:"active",data:{price:10,imageUrl}}));
 assert.equal(validateResource("menu",{name:"X",status:"active",data:{price:10,categoryId:"11111111-1111-4111-8111-111111111111",imageUrl:"/api/restaurant/assets/11111111-1111-4111-8111-111111111111"}}).data.price,10);
});
test("registered pickup points require a usable address and remain branch-scoped resources",()=>{
 const point=validateResource("pickupPoints",{name:"الفرع الشمالي",status:"active",branchId:"11111111-1111-4111-8111-111111111111",data:{address:"شارع الملك فهد",nameEn:"North branch",mapUrl:"https://maps.example.com/location",instructions:"اذكر رقم الطلب"}});
 assert.equal(resourceModules.pickupPoints.kind,"pickup_point");
 assert.equal(point.branchId,"11111111-1111-4111-8111-111111111111");
 assert.equal(point.data.address,"شارع الملك فهد");
 assert.throws(()=>validateResource("pickupPoints",{name:"نقطة بلا فرع",status:"active",data:{address:"عنوان"}}));
 assert.throws(()=>validateResource("pickupPoints",{name:"نقطة بلا عنوان",status:"active",data:{}}));
 assert.throws(()=>validateResource("pickupPoints",{name:"نقطة",status:"active",data:{address:"عنوان",mapUrl:"javascript:alert(1)"}}));
});
test("registered hotel rooms require a branch and normalize room numbers",()=>{
 const branch="11111111-1111-4111-8111-111111111111";
 const room=validateResource("hotelRooms",{name:"Room a-101",status:"active",branchId:branch,data:{roomNumber:"a-101"}});
 assert.equal(resourceModules.hotelRooms.kind,"hotel_room");assert.equal(room.branchId,branch);assert.equal(room.data.roomNumber,"A-101");
 assert.throws(()=>validateResource("hotelRooms",{name:"Room 101",status:"active",data:{roomNumber:"101"}}),{code:"REQUIRED_BRANCH"});
 for(const value of ["","  ","Room 101 / <script>"," ".repeat(25)])assert.throws(()=>validateResource("hotelRooms",{name:"Room",status:"active",branchId:branch,data:{roomNumber:value}}));
});
test("reservation no-show grace is an optional bounded branch setting",()=>{
 const field=resourceModules.settings.fields.find(item=>item.key==="noShowGraceMinutes");
 assert.ok(field);assert.equal(field.min,0);assert.equal(field.max,1440);assert.equal(field.integer,true);
 for(const value of [-1,1441,2.5,"later"])
  assert.throws(()=>validateResource("settings",{name:"Branch",status:"active",data:{noShowGraceMinutes:value}}));
 assert.equal(validateResource("settings",{name:"Branch",status:"active",data:{noShowGraceMinutes:0}}).data.noShowGraceMinutes,0);
});
test("preparation printers require a routable department while receipt-only printers do not",()=>{
 const branch="11111111-1111-4111-8111-111111111111",department="22222222-2222-4222-8222-222222222222";
 const base={name:"Section printer",status:"active",branchId:branch,data:{connection:"network",address:"192.168.1.20",paperWidth:"80",purpose:"preparation",autoPrint:"yes",printOn:"on_accept"}};
 assert.throws(()=>validateResource("printers",base),{code:"REQUIRED_departmentId"});
 assert.equal(validateResource("printers",{...base,data:{...base.data,departmentId:department}}).data.departmentId,department);
 assert.equal(validateResource("printers",{...base,data:{...base.data,purpose:"customer_receipt",printOn:"on_paid"}}).data.departmentId,null);
 assert.throws(()=>validateResource("printers",{...base,data:{...base.data,purpose:"both"}}),{code:"INVALID_purpose"});
 assert.equal(validateResource("printers",{...base,id:"33333333-3333-4333-8333-333333333333",data:{...base.data,purpose:"both",departmentId:department}}).data.purpose,"both","existing combined printers remain editable during migration");
});
test("printer routing links whole menu categories to operating departments",()=>{
 const departmentFields=resourceModules.departments.fields.map(field=>field.key);
 assert.equal(resourceModules.departments.label,"أقسام التشغيل");
 assert.equal(departmentFields.some(key=>key.startsWith("printer")),false,"printers are configured once in the printer record, not duplicated on department records");
 const fields=resourceModules.departmentAssignments.fields;
 assert.equal(resourceModules.departmentAssignments.label,"ربط أقسام المنيو بالطابعات");
 assert.equal(fields.find(field=>field.key==="categoryId")?.ref,"categories");
 assert.equal(fields.find(field=>field.key==="departmentId")?.ref,"departments");
 assert.equal(fields.some(field=>field.key==="itemId"),false);
 const route=validateResource("departmentAssignments",{name:"القهوة إلى البار",status:"active",data:{departmentId:"11111111-1111-4111-8111-111111111111",categoryId:"22222222-2222-4222-8222-222222222222",printCopies:2}});
 assert.equal(route.data.categoryId,"22222222-2222-4222-8222-222222222222");
});
test("staff roles, coupon bounds and attendance chronology are constrained",()=>{
 assert.throws(()=>validateResource("team",{name:"X",status:"active",data:{email:"x@example.com",role:"owner"}}));
 assert.throws(()=>validateResource("coupons",{name:"X",status:"active",data:{code:"SAVE",discountType:"percent",value:101}}));
 assert.throws(()=>validateResource("attendance",{name:"X",status:"present",data:{employeeId:"11111111-1111-4111-8111-111111111111",date:"2026-02-31"}}));
 assert.throws(()=>validateResource("attendance",{name:"X",status:"present",data:{employeeId:"11111111-1111-4111-8111-111111111111",date:"2026-10-09",checkIn:"2026-10-09T12:00:00Z",checkOut:"2026-10-09T11:00:00Z"}}));
 const coupon=validateResource("coupons",{name:"Offer",status:"active",data:{code:"save_10",discountType:"percent",value:10}});
 assert.equal(coupon.data.code,"SAVE_10");
});

test("waiter test fixture accepts syntactically valid email and rejects malformed email",()=>{
 const waiter=validateResource("team",{name:"محمد",status:"active",data:{email:"m@gmil.com",role:"waiter",phone:"0569867000"}});
 assert.equal(waiter.data.email,"m@gmil.com");
 assert.equal(waiter.data.role,"waiter");
 assert.equal(waiter.data.phone,"0569867000");
 assert.throws(()=>validateResource("team",{name:"محمد",status:"active",data:{email:"invalid-email",role:"waiter"}}));
});
test("four dining sections validate independently without a database",()=>{
 const cases=[
  {name:"مدخنون – خارجي",area:"outdoor",smoking:"smoking"},
  {name:"غير مدخنين – خارجي",area:"outdoor",smoking:"non_smoking"},
  {name:"مدخنون – داخلي",area:"indoor",smoking:"smoking"},
  {name:"غير مدخنين – داخلي",area:"indoor",smoking:"non_smoking"}
 ];
 for(const {name,area,smoking} of cases){
  const section=validateResource("sections",{name,status:"active",data:{area,smoking,description:"قسم صالة تجريبي"}});
  assert.equal(section.name,name);
  assert.equal(section.status,"active");
  assert.equal(section.data.area,area);
  assert.equal(section.data.smoking,smoking);
 }
 const custom=validateResource("sections",{name:"قسم مخصص",status:"active",data:{area:"roof",smoking:"sometimes"}});
 assert.equal(custom.data.area,"roof");assert.equal(custom.data.smoking,"sometimes");
 const optional=validateResource("sections",{name:"قسم بسيط",status:"active",data:{}});
 assert.equal(optional.data.area,null);assert.equal(optional.data.smoking,null);
 for(const key of ["area","smoking"])assert.throws(()=>validateResource("sections",{name:"قسم غير صالح",status:"active",data:{[key]:"x".repeat(81)}}));
 assert.throws(()=>validateResource("sections",{name:"قسم غير صالح",status:"active",data:{unknownClassification:"roof"}}));
});

test("public works quotation enforces customer, service, amount and lifecycle",()=>{
 const valid={name:"تجديد محل",status:"draft",data:{customerName:"عميل",serviceDescription:"أعمال صيانة",amount:1200}};
 const created=validateResource("quotations",valid);
 assert.equal(created.data.amount,1200);
 for(const status of ["draft","sent","accepted","rejected","cancelled"])assert.equal(validateResource("quotations",{...valid,status}).status,status);
 for(const amount of [-1,Infinity,NaN,100000001])assert.throws(()=>validateResource("quotations",{...valid,data:{...valid.data,amount}}));
 assert.throws(()=>validateResource("quotations",{...valid,data:{...valid.data,customerName:""}}));
 assert.throws(()=>validateResource("quotations",{...valid,data:{...valid.data,serviceDescription:""}}));
 assert.throws(()=>validateResource("quotations",{...valid,status:"paid"}));
});

test("quotation updates require a controlled approval lifecycle",()=>{
 const source=readFileSync(new URL("../lib/restaurant/operations.ts",import.meta.url),"utf8");
 assert.match(source,/module==="quotations"&&previous/);
 assert.match(source,/draft:\["draft","sent","cancelled"\]/);
 assert.match(source,/sent:\["sent","accepted","rejected","cancelled"\]/);
 assert.match(source,/accepted:\[\],rejected:\[\],cancelled:\[\]/);
 assert.match(source,/INVALID_QUOTATION_TRANSITION/);
 assert.match(source,/QUOTATION_SENT_IMMUTABLE/);
 assert.match(source,/module==="quotations"&&previous\?\.status!=="draft"/);
 assert.match(source,/QUOTATION_ARCHIVE_FORBIDDEN/);
 assert.match(source,/QUOTATION_EXPIRED/);
 assert.match(source,/module==="quotations"&&input\.status==="sent"&&input\.data\.validUntil/);
 assert.match(source,/if\(from==="sent"&&JSON\.stringify\(parseData\(previous\.data\)\)/);
 assert.match(source,/String\(previous\.branch_id\?\?""\)/);
 assert.match(source,/from==="sent"&&to==="accepted"/);
});

test("customer invoices link only accepted quotations with matching totals",()=>{
 const quotationField=resourceModules.customerInvoices.fields.find(field=>field.key==="quotationId");
 assert.equal(quotationField?.ref,"quotations");
 const source=readFileSync(new URL("../lib/restaurant/operations.ts",import.meta.url),"utf8");
 for(const error of ["QUOTATION_NOT_ACCEPTED","QUOTATION_INVOICE_AMOUNT_MISMATCH","QUOTATION_ALREADY_INVOICED"])assert.ok(source.includes(error));
 assert.match(source,/kind='service_quotation' AND archived=FALSE FOR UPDATE/);
 assert.ok(source.includes("JSON_UNQUOTE(JSON_EXTRACT(data,'$.quotationId'))"));
 assert.ok(source.includes("ISSUED_INVOICE_IMMUTABLE"));
 assert.ok(source.includes("INVOICE_QUOTATION_LINK_IMMUTABLE"));
 assert.match(source,/\["issued","paid","void"\]/);
});

test("customer invoice lifecycle rejects backwards and unverified payment transitions",()=>{
 const source=readFileSync(new URL("../lib/restaurant/operations.ts",import.meta.url),"utf8");
 assert.match(source,/draft:\["draft","issued","void"\]/);
 assert.match(source,/issued:\["issued","paid","void"\]/);
 assert.match(source,/paid:\["paid"\],void:\["void"\]/);
 assert.ok(source.includes("INVALID_INVOICE_TRANSITION"));
 assert.ok(source.includes('!previous&&!["draft","issued"].includes(String(input.status))'));
});

test("issued paid and void customer invoices cannot be archived",()=>{
 const source=readFileSync(new URL("../lib/restaurant/operations.ts",import.meta.url),"utf8");
 assert.ok(source.includes('module==="customerInvoices"&&previous?.status!=="draft"'));
 assert.ok(source.includes("INVOICE_ARCHIVE_FORBIDDEN"));
});

test("invoice order references resolve against tenant scoped orders instead of generic resources",()=>{
 const source=readFileSync(new URL("../lib/restaurant/operations.ts",import.meta.url),"utf8");
 assert.ok(source.includes('if(field.ref==="orders")'));
 assert.ok(source.includes("SELECT id,branch_id,total,status FROM restaurant_orders WHERE id=? AND tenant_id=? LIMIT 1 FOR UPDATE"));
 assert.equal(resourceModules.customerInvoices.fields.find(field=>field.key==="orderId")?.ref,"orders");
});

test("linked customer invoice totals match live orders and exclude cancelled orders",()=>{
 const source=readFileSync(new URL("../lib/restaurant/operations.ts",import.meta.url),"utf8");
 assert.ok(source.includes("ORDER_INVOICE_AMOUNT_MISMATCH"));
 assert.ok(source.includes("INVOICE_ORDER_CANCELLED"));
 assert.ok(source.includes('orders[0].status==="cancelled"'));
});

test("a restaurant order cannot be invoiced twice by concurrent requests",()=>{
 const source=readFileSync(new URL("../lib/restaurant/operations.ts",import.meta.url),"utf8");
 assert.ok(source.includes("ORDER_ALREADY_INVOICED"));
 assert.ok(source.includes("JSON_UNQUOTE(JSON_EXTRACT(data,'$.orderId'))=? LIMIT 1 FOR UPDATE"));
 assert.ok(source.includes("SELECT id,branch_id,total,status FROM restaurant_orders WHERE id=? AND tenant_id=? LIMIT 1 FOR UPDATE"));
});

test("customer invoice cannot be reassigned to another order after initial linking",()=>{
 const source=readFileSync(new URL("../lib/restaurant/operations.ts",import.meta.url),"utf8");
 assert.ok(source.includes("INVOICE_ORDER_LINK_IMMUTABLE"));
 assert.ok(source.includes("parseData(previous.data).orderId!==input.data.orderId"));
});

test("finalized invoice names are immutable with invoice amounts and branch",()=>{
 const source=readFileSync(new URL("../lib/restaurant/operations.ts",import.meta.url),"utf8");
 assert.ok(source.includes('String(previous.name)!==String(input.name))throw new ResourceError("ISSUED_INVOICE_IMMUTABLE")'));
});

test("invoice can retain quotation and order links with independent amount validation",()=>{
 const source=readFileSync(new URL("../lib/restaurant/operations.ts",import.meta.url),"utf8");
 assert.ok(!source.includes("INVOICE_MULTIPLE_SOURCES"));
 assert.ok(source.includes("QUOTATION_INVOICE_AMOUNT_MISMATCH"));
 assert.ok(source.includes("ORDER_INVOICE_AMOUNT_MISMATCH"));
 assert.ok(source.includes("QUOTATION_ALREADY_INVOICED"));
 assert.ok(source.includes("ORDER_ALREADY_INVOICED"));
});

test("linked quotation and order must belong to the same branch",()=>{
 const source=readFileSync(new URL("../lib/restaurant/operations.ts",import.meta.url),"utf8");
 assert.ok(source.includes('quotes[0].branch_id!==linkedOrders[0].branch_id)throw new ResourceError("INVOICE_SOURCE_BRANCH_MISMATCH")'));
 assert.ok(source.includes('SELECT branch_id,customer_phone FROM restaurant_orders WHERE id=? AND tenant_id=? LIMIT 1 FOR UPDATE'));
});

test("invoice quote-order linkage rejects different customer phone numbers",()=>{
 const source=readFileSync(new URL("../lib/restaurant/operations.ts",import.meta.url),"utf8");
 assert.ok(source.includes("INVOICE_SOURCE_CUSTOMER_MISMATCH"));
 assert.ok(source.includes("SELECT branch_id,customer_phone FROM restaurant_orders WHERE id=? AND tenant_id=? LIMIT 1 FOR UPDATE"));
});

test("service orders validate required fields and accepted quotation references",()=>{
 const quotationId="11111111-1111-4111-8111-111111111111";
 const order=validateResource("serviceOrders",{name:"Repair",status:"new",data:{quotationId,customerName:"Customer",serviceDescription:"Repair equipment",amount:120}});
 assert.equal(order.data.quotationId,quotationId);
 assert.equal(order.data.amount,120);
 assert.throws(()=>validateResource("serviceOrders",{name:"Repair",status:"new",data:{customerName:"Customer",amount:120}}));
 assert.throws(()=>validateResource("serviceOrders",{name:"Repair",status:"new",data:{customerName:"Customer",serviceDescription:"Repair equipment",amount:-1}}));
 assert.throws(()=>validateResource("serviceOrders",{name:"Repair",status:"new",data:{quotationId:"foreign",customerName:"Customer",serviceDescription:"Repair equipment",amount:120}}));
});


test("customer and internal invoice amounts reject fractional minor units",()=>{
 for(const [module,data] of [
  ["customerInvoices",{subtotal:10}],
  ["internalInvoices",{invoiceNumber:"INV-TEST",subtotal:10}]
 ]){
  for(const key of ["subtotal","taxAmount","serviceFee"]){
   const body={name:"Precision regression",status:"draft",data};
   assert.equal(validateResource(module,{...body,data:{...data,[key]:10.01}}).data[key],10.01);
   assert.equal(validateResource(module,{...body,data:{...data,[key]:0.1+0.2}}).data[key],0.1+0.2);
   for(const invalid of [10.001,9.999,0.0001])
    assert.throws(()=>validateResource(module,{...body,data:{...data,[key]:invalid}}),{code:"INVALID_AMOUNT_PRECISION"});
  }
 }
});

test("quotation and service order source amounts reject fractional minor units",()=>{
 for(const [module,status] of [["quotations","draft"],["serviceOrders","new"]]){
  const base={name:"Precision regression",status,data:{customerName:"Customer",serviceDescription:"Service",amount:10}};
  assert.equal(validateResource(module,{...base,data:{...base.data,amount:10.01}}).data.amount,10.01);
  for(const invalid of [10.001,9.999,0.0001])
   assert.throws(()=>validateResource(module,{...base,data:{...base.data,amount:invalid}}),{code:"INVALID_AMOUNT_PRECISION"});
 }
});
