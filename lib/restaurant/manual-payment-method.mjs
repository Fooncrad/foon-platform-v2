// Keep POS manual payment methods as explicit protocol values. Never coerce
// arrays, objects, or other JSON types into a payment method string.
export function validManualPaymentMethod(value){
 return value==="cash"||value==="card"||value==="other";
}
