import test from "node:test";
import assert from "node:assert/strict";
import {SERVICE_BUSINESSES,serviceRequestTypeAllowed,serviceRequestTransitionAllowed,validServiceRequestPhone,validServiceAppointmentTime} from "../lib/platform/service-request-policy.ts";
test("all 15 activity codes cannot accidentally accept unsupported service requests",()=>{
 const all=["restaurant","cafe","sweets","grocery","clothing","perfume","accessories","watches","gifts","ecommerce","carwash","laundry","automotive","salon","publicworks"];
 assert.equal(all.length,15);assert.equal(SERVICE_BUSINESSES.size,5);
 for(const activity of all){
  assert.equal(serviceRequestTypeAllowed(activity,"inquiry"),SERVICE_BUSINESSES.has(activity),activity);
  assert.equal(serviceRequestTypeAllowed(activity,"appointment",true),["automotive","carwash","salon"].includes(activity),activity);
  assert.equal(serviceRequestTypeAllowed(activity,"quote",true),activity==="publicworks",activity);
  assert.equal(serviceRequestTypeAllowed(activity,"appointment",false),false,activity);
 }
});
test("quotes are inquiries, not confirmed price offers",()=>{
 assert.equal(serviceRequestTypeAllowed("publicworks","quote"),true);
 assert.equal(serviceRequestTransitionAllowed("pending","confirmed","quote"),false);
 assert.equal(serviceRequestTransitionAllowed("pending","responded","quote"),true);
});
test("customer cannot choose accepted or completed status",()=>{
 for(const type of ["appointment","quote","inquiry"]){
  assert.equal(serviceRequestTransitionAllowed("pending","completed",type),false);
  assert.equal(serviceRequestTransitionAllowed("pending","cancelled",type),false);
 }
});
test("appointments can be confirmed and completed only by the merchant lifecycle",()=>{
 assert.equal(serviceRequestTransitionAllowed("pending","confirmed","appointment"),true);
 assert.equal(serviceRequestTransitionAllowed("confirmed","completed","appointment"),true);
 assert.equal(serviceRequestTransitionAllowed("confirmed","declined","appointment"),false);
 assert.equal(serviceRequestTransitionAllowed("completed","pending","appointment"),false);
});
test("non-appointment service requests cannot impersonate booked appointments",()=>{
 for(const type of ["quote","inquiry"]){
  assert.equal(serviceRequestTransitionAllowed("pending","confirmed",type),false);
  assert.equal(serviceRequestTransitionAllowed("in_review","confirmed",type),false);
  assert.equal(serviceRequestTransitionAllowed("in_review","responded",type),true);
 }
});
test("validate phone safely, independently of the browser form",()=>{
 for(const phone of ["+966501234567","0501234567","123 456 789"])assert.equal(validServiceRequestPhone(phone),true);
 for(const phone of ["12345","foo1234567","00+5555555","",null,[],{},12])assert.equal(validServiceRequestPhone(phone),false);
});
test("appointment window includes future 15min to 90 days and rejects invalid timestamps",()=>{
 const now=Date.UTC(2026,9,17,10);
 assert.equal(validServiceAppointmentTime(new Date(now+15*60000).toISOString(),now),true);
 assert.equal(validServiceAppointmentTime(new Date(now+90*86400000).toISOString(),now),true);
 assert.equal(validServiceAppointmentTime(new Date(now+14*60000).toISOString(),now),false);
 assert.equal(validServiceAppointmentTime(new Date(now+91*86400000).toISOString(),now),false);
 assert.equal(validServiceAppointmentTime("invalid",now),false);
 assert.equal(validServiceAppointmentTime(null,now),false);
});
test("terminal statuses cannot reopen by status forgery",()=>{
 for(const state of ["declined","responded","completed","cancelled"])
  for(const type of ["quote","inquiry","appointment"])
   assert.equal(serviceRequestTransitionAllowed(state,"pending",type),false,state+":"+type);
});
