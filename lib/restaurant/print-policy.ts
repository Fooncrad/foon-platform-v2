type PrintEvent="on_accept"|"on_prepare"|"on_paid";
type PrinterPolicy={autoPrint?:unknown;purpose?:unknown;printOn?:unknown};
type OrderPrintState={status:string;paymentStatus:string};

export function printerHandlesOrderEvent(printer:PrinterPolicy,event:PrintEvent){
 if(printer.autoPrint!=="yes"||printer.printOn==="manual")return false;
 const purpose=String(printer.purpose??"preparation");
 if(event==="on_paid")return ["customer_receipt","both"].includes(purpose)&&(purpose==="both"||printer.printOn===event);
 if(!["preparation","both"].includes(purpose))return false;
 return printer.printOn===event;
}

export function shouldQueueFinalReceipt(next:OrderPrintState,previous:OrderPrintState){
 return next.status==="completed"&&next.paymentStatus==="paid"&&(next.status!==previous.status||next.paymentStatus!==previous.paymentStatus);
}
