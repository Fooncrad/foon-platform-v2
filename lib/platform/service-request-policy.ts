/** Public service inquiries are not formal quotations or paid reservations.
 * Every request stays pending until explicitly reviewed by the merchant.
 */
export const SERVICE_BUSINESSES=new Set(["carwash","laundry","automotive","salon","publicworks"]);
export const APPOINTMENT_BUSINESSES=new Set(["carwash","automotive","salon"]);
export function serviceRequestTypeAllowed(activity:string,type:string,appointmentsGranted=false){
 if(!SERVICE_BUSINESSES.has(activity))return false;
 if(type==="quote")return activity==="publicworks";
 if(type==="appointment")return APPOINTMENT_BUSINESSES.has(activity)&&appointmentsGranted;
 return type==="inquiry";
}
export function serviceRequestTransitionAllowed(from:string,to:string,type:string){
 if(from==="pending")return ["in_review","declined",...(type==="appointment"?["confirmed"]:["responded"])].includes(to);
 if(from==="in_review")return ["declined",...(type==="appointment"?["confirmed"]:["responded"])].includes(to);
 if(from==="confirmed")return type==="appointment"&&["completed","cancelled"].includes(to);
 return false;
}
export function validServiceRequestPhone(phone:unknown){
 return typeof phone==="string"&&/^\+?[0-9 ()-]{7,40}$/.test(phone)&&phone.replace(/\D/g,"").length>=7;
}
export function validServiceAppointmentTime(input:unknown,now=Date.now()){
 if(typeof input!=="string")return false;
 const time=Date.parse(input);
 return Number.isFinite(time)&&time>=now+15*60000&&time<=now+90*86400000;
}
