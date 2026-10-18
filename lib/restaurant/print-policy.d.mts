export function printerDispatchAllowed(payload:{triggerEvent?:string}|null,config:{autoPrint?:unknown;purpose?:unknown;printOn?:unknown}|null):boolean;
export function routePreparationItems<T>(items:T[],routes:Array<{itemId?:unknown;departmentId?:unknown}>,departmentId:string|null|undefined):T[];
export function preparationPrintEvents(previousStatus:string,nextStatus:string):("on_accept"|"on_prepare")[];
export function customerReceiptPrintDue(previousStatus:string,previousPayment:string,nextStatus:string,nextPayment:string):boolean;
