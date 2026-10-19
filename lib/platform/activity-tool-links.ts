import {isActivityType,localizedActivityModules,type ActivityLanguage} from "./activity-presets.ts";

const destinations:Record<string,string>={
 serviceOrders:"serviceOrders",orders:"orders",pos:"pos",tables:"tables",reservations:"reservations",waitlist:"reservations",
 kitchen:"kds",waiter:"tables",inventory:"inventory",barcode:"inventory",suppliers:"inventory",delivery:"orders",pickup:"pickupPoints",
 room_service:"roomService",variants:"menu",bookings:"serviceOrders",quotes:"quotes",staff:"team",invoices:"printers",
 reports:"reports",branches:"branches",customers:"customers",marketing:"marketing",security:"security"
};
const sharedTools=["staff","invoices","reports","branches","customers","marketing","mediaStudio","mediaLibrary","security"] as const;
const sharedLabels:Record<string,Record<ActivityLanguage,string>>={
 staff:{ar:"الموظفون والصلاحيات",en:"Staff and permissions",fr:"Équipe et autorisations"},
 invoices:{ar:"الطابعات والفواتير",en:"Printers and invoices",fr:"Imprimantes et factures"},
 reports:{ar:"التقارير",en:"Reports",fr:"Rapports"},
 branches:{ar:"الفروع والإعدادات",en:"Branches and settings",fr:"Succursales et paramètres"},
 customers:{ar:"العملاء",en:"Customers",fr:"Clients"},
 marketing:{ar:"التسويق",en:"Marketing",fr:"Marketing"},
 mediaStudio:{ar:"إدارة الميديا",en:"Media Studio",fr:"Studio média"},
 mediaLibrary:{ar:"مكتبة الصور",en:"Media library",fr:"Bibliothèque d’images"},
 security:{ar:"أمان الحساب",en:"Account security",fr:"Sécurité du compte"}
};

export type ActivityToolLink={href:string;label:string;codes:string[]};

export function activityToolLinks(activity:string,tenantId:string,language:ActivityLanguage):ActivityToolLink[]{
 if(!isActivityType(activity))return [];
 const modules=localizedActivityModules(activity,language);
 if(modules.some(module=>module.code==="services")&&!modules.some(module=>module.code==="serviceOrders")){
  modules.push({code:"serviceOrders",label:language==="ar"?"أوامر الخدمة":language==="fr"?"Ordres de service":"Service orders"});
 }
 for(const code of sharedTools){
  if(modules.some(module=>module.code===code))continue;
  const label=sharedLabels[code]?.[language];
  if(label)modules.push({code,label});
 }
 const base="/workspace/"+encodeURIComponent(activity)+"?tenant="+encodeURIComponent(tenantId);
 const resolved=modules.flatMap(module=>{
  const href=module.code==="payments"?"/workspace/"+encodeURIComponent(activity)+"/payments?tenant="+encodeURIComponent(tenantId)
   :module.code==="mediaStudio"?"/workspace/"+encodeURIComponent(activity)+"/media-studio?tenant="+encodeURIComponent(tenantId)
   :module.code==="mediaLibrary"?"/account/library"
   :module.code==="catalog"||module.code==="services"?base+"&section=menu"
   :destinations[module.code]?base+"&section="+destinations[module.code]:null;
  return href?[{href,label:module.label,code:module.code}]:[];
 });
 const grouped=new Map<string,ActivityToolLink>();
 for(const item of resolved){
  const previous=grouped.get(item.href);
  if(previous){previous.codes.push(item.code);previous.label+=" · "+item.label;}
  else grouped.set(item.href,{href:item.href,label:item.label,codes:[item.code]});
 }
 return [...grouped.values()];
}
