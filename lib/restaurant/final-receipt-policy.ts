// The same rule used by automatic customer-receipt print dispatch.
export function finalReceiptEligible(status:unknown,paymentStatus:unknown):boolean{
 return status==="completed"&&paymentStatus==="paid";
}
