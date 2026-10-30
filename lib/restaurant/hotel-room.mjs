/** Consistent room identifiers across merchant entry and customer checkout. */
export function normalizeHotelRoomNumber(value){
 if(typeof value!=="string")return "";
 return value.normalize("NFKC")
  .replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-1632))
  .replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-1776))
  .trim().replace(/\s+/g," ").toLocaleUpperCase("en-US");
}
export function validHotelRoomNumber(value){
 return typeof value==="string"&&/^[\p{L}\p{N}][\p{L}\p{N} -]{0,23}$/u.test(value);
}
/**
 * Customer checkout requires a verified customer ID supplied by its route.
 * A staff POS route may create an unlinked room-service order, but only after
 * its own tenant, branch, role, permission, PIN and room checks have passed.
 * This flag must never be read from a client request body.
 */
export function roomServiceCheckoutAllowed(roomNumber,customerId,authorizedStaffPos=false){
 return validHotelRoomNumber(roomNumber)&&(Boolean(customerId)||authorizedStaffPos===true);
}
