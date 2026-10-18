export function printerDispatchAllowed(payload,config){
 if(config?.autoPrint!=="yes"||config?.printOn==="manual")return false;
 const event=payload?.triggerEvent,purpose=config?.purpose;
 if(event==="on_paid")return ["customer_receipt","both"].includes(purpose)&&(purpose==="both"||config?.printOn===event);
 return ["on_accept","on_prepare"].includes(event)&&["preparation","both"].includes(purpose)&&config?.printOn===event;
}

export function routePreparationItems(items,routes,departmentId){
 if(!departmentId)return [];
 return items.filter(item=>routes.some(route=>{
  const departmentMatches=String(route.departmentId??"")===String(departmentId);
  const categoryId=String(item.category_id??item.categoryId??"");
  const categoryMatches=route.categoryId&&String(route.categoryId)===categoryId;
  // Prefer category routes once a category is mapped. Old item routes only
  // bridge categories that have not been configured yet.
  const categoryIsMapped=categoryId&&routes.some(candidate=>String(candidate.categoryId??"")===categoryId);
  const legacyItemMatches=route.itemId&&String(route.itemId)===String(item.menu_item_id??"");
  return departmentMatches&&(categoryMatches||(!categoryIsMapped&&legacyItemMatches));
 }));
}
export function preparationPrintEvents(previousStatus,nextStatus){return previousStatus==="new"&&nextStatus==="preparing"?["on_accept","on_prepare"]:[];}
export function customerReceiptPrintDue(previousStatus,previousPayment,nextStatus,nextPayment){return nextStatus==="completed"&&nextPayment==="paid"&&!(previousStatus==="completed"&&previousPayment==="paid");}
