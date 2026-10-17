export type OrderChannel="delivery"|"takeaway"|"dine_in";
type Settings=Record<string,unknown>;
const keys:Record<OrderChannel,string>={delivery:"deliveryEnabled",takeaway:"pickupEnabled",dine_in:"dineInEnabled"};
function localMinute(now:Date,timeZone:string){
 try{const p=new Intl.DateTimeFormat("en-GB",{timeZone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);
  return Number(p.find(v=>v.type==="hour")?.value)*60+Number(p.find(v=>v.type==="minute")?.value);
 }catch{return null;}
}
function minute(value:unknown){if(typeof value!=="string"||!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(value))return null;const [h,m]=value.split(":").map(Number);return h*60+m;}
export function orderChannelStatus(store:Settings,branch:Settings,channel:OrderChannel,now=new Date()):{allowed:boolean;reason?:string}{
 if(store.ordersEnabled==="no"||branch.ordersEnabled==="no")return{allowed:false,reason:"ORDERS_DISABLED"};
 const key=keys[channel];
 if(store[key]==="no"||branch[key]==="no")return{allowed:false,reason:"ORDER_CHANNEL_DISABLED"};
 const start=minute(branch.openingTime),end=minute(branch.closingTime);
 // Legacy branches without configured hours remain usable until the manager sets hours.
 if(start===null||end===null)return{allowed:true};
 const current=localMinute(now,String(branch.timeZone||"UTC"));
 if(current===null)return{allowed:false,reason:"INVALID_BRANCH_TIMEZONE"};
 if(start===end)return{allowed:false,reason:"STORE_CLOSED"};
 const open=start<end?current>=start&&current<end:current>=start||current<end;
 return open?{allowed:true}:{allowed:false,reason:"STORE_CLOSED"};
}
