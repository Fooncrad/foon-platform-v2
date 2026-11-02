/** Keep order tracking tied to server-issued UUIDs, never user-provided URLs. */
const orderIdPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function customerOrderLink(id){
 return typeof id==="string"&&orderIdPattern.test(id)?"/customer#customer-order-"+id:null;
}
