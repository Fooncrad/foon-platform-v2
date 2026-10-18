export function printerDispatchAllowed(payload,config){
 if(config?.autoPrint!=="yes"||config?.printOn==="manual")return false;
 const event=payload?.triggerEvent,purpose=config?.purpose;
 if(event==="on_paid")return ["customer_receipt","both"].includes(purpose)&&(purpose==="both"||config?.printOn===event);
 return ["on_accept","on_prepare"].includes(event)&&["preparation","both"].includes(purpose)&&config?.printOn===event;
}

export function routePreparationItems(items,routes,departmentId){
 if(!departmentId)return [];
 return items.filter(item=>routes.some(route=>String(route.itemId??"")===String(item.menu_item_id??"")&&String(route.departmentId??"")===String(departmentId)));
}
