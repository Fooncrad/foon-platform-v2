import test from "node:test";
import assert from "node:assert/strict";
import {validateResource} from "./restaurant-resource-schema.mjs";
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
 const names=["مدخنون – خارجي","غير مدخنين – خارجي","مدخنون – داخلي","غير مدخنين – داخلي"];
 for(const name of names){
  const section=validateResource("sections",{name,status:"active",data:{description:"قسم صالة تجريبي"}});
  assert.equal(section.name,name);
  assert.equal(section.status,"active");
 }
});
