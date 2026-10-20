/** Task-first presentation only. RBAC, activity and plan filtering stay at the caller. */
export const MERCHANT_NAV_GROUPS=["daily","catalog","team","growth","reports","settings"] as const;
export type MerchantNavGroup=typeof MERCHANT_NAV_GROUPS[number];
export type MerchantNavLanguage="ar"|"en"|"fr";
export const MERCHANT_NAV_LABELS:Record<MerchantNavGroup,Record<MerchantNavLanguage,string>>={
 daily:{ar:"العمل اليومي",en:"Daily operations",fr:"Opérations quotidiennes"},
 catalog:{ar:"المنتجات والمخزون",en:"Products and inventory",fr:"Produits et stocks"},
 team:{ar:"الفروع والفريق",en:"Branches and team",fr:"Succursales et équipe"},
 growth:{ar:"العملاء والنمو",en:"Customers and growth",fr:"Clients et croissance"},
 reports:{ar:"التقارير والمالية",en:"Reports and finance",fr:"Rapports et finances"},
 settings:{ar:"الإدارة والإعدادات",en:"Administration and settings",fr:"Gestion et paramètres"}
};
const SECTION_GROUP:Record<string,MerchantNavGroup>={
 assigned:"daily",overview:"daily",orders:"daily",pos:"daily",kds:"daily",tables:"daily",roomService:"daily",serviceOrders:"daily",quotes:"daily",reservations:"daily",pickupPoints:"daily",
 menu:"catalog",inventory:"catalog",
 branches:"team",team:"team",remote:"team",
 customers:"growth",marketing:"growth",
 reports:"reports",printers:"reports",payments:"reports",
 storefront:"settings",publicControls:"settings",security:"settings",health:"settings",subscription:"settings"
};
/** Group only already-authorized visible modules; never look up hidden ones. */
export function merchantNavGroupFor(section:string):MerchantNavGroup{return SECTION_GROUP[section]??"settings";}
export function groupVisibleMerchantSections<T extends {key:string}>(visible:readonly T[]){
 return MERCHANT_NAV_GROUPS.map(key=>({
  key,
  items:visible.filter(section=>merchantNavGroupFor(section.key)===key)
 })).filter(group=>group.items.length>0);
}
