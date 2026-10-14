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
});
