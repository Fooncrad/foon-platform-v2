import {isActivityType,type ActivityType} from "./activity-presets.ts";

/** Activity identity is based on the tenant's actual activity_code, not its route alias.
 * Shared sections retain their semantic icons; only activity-specific sections
 * use overrides. Presentation never changes RBAC, plan grants or navigation.
 */
export const ACTIVITY_IDENTITY_ICONS:Record<ActivityType,string>={
 restaurant:"menu",
 cafe:"coffee",
 sweets:"cake",
 grocery:"basket",
 clothing:"shirt",
 perfume:"perfume",
 accessories:"gem",
 watches:"watch",
 gifts:"gift",
 ecommerce:"cart",
 carwash:"carwash",
 laundry:"washer",
 automotive:"car",
 salon:"scissors",
 publicworks:"hardhat"
};
const SHARED_SECTIONS:Readonly<Record<string,string>>={
 assigned:"table",overview:"dashboard",branches:"store",orders:"bag",pos:"wallet",
 kds:"chef",tables:"table",roomService:"bed",inventory:"box",pickupPoints:"store",
 serviceOrders:"clipboard",quotes:"file",printers:"printer",team:"users",marketing:"trend",
 reservations:"calendar",reports:"trend",customers:"users",storefront:"store",
 publicControls:"shield",remote:"users",payments:"wallet",security:"shield",
 health:"shield",subscription:"wallet"
};
const SERVICE_ORDER_ICONS:Readonly<Partial<Record<ActivityType,string>>>={
 carwash:"carwash",laundry:"washer",automotive:"wrench",salon:"scissors",publicworks:"hardhat"
};
const TOOLS:Readonly<Record<string,string>>={
 catalog:"store",services:"wrench",serviceOrders:"clipboard",orders:"bag",
 pos:"wallet",tables:"table",reservations:"calendar",waitlist:"clock",
 kitchen:"chef",waiter:"table",inventory:"box",barcode:"barcode",
 suppliers:"box",delivery:"truck",pickup:"store",room_service:"bed",
 variants:"sliders",bookings:"calendar",quotes:"file",staff:"users",
 invoices:"printer",reports:"trend",branches:"store",customers:"users",
 marketing:"trend",mediaStudio:"film",mediaLibrary:"image",
 security:"shield",payments:"wallet"
};
export function activityIdentityIcon(activity:string):string{
 return isActivityType(activity)?ACTIVITY_IDENTITY_ICONS[activity]:"store";
}
export function activitySectionIcon(activity:string,section:string,fallback="dashboard"):string{
 if(section==="menu")return activityIdentityIcon(activity);
 if(section==="orders"&&isActivityType(activity)&&SERVICE_ORDER_ICONS[activity])return "clipboard";
 if(section==="serviceOrders"&&isActivityType(activity))return SERVICE_ORDER_ICONS[activity]??"clipboard";
 return SHARED_SECTIONS[section]??fallback;
}
export function activityToolIcon(activity:string,codes:readonly string[]):string{
 const primary=codes[0]??"";
 if(primary==="catalog"||primary==="services")return activityIdentityIcon(activity);
 if(primary==="orders"&&isActivityType(activity)&&SERVICE_ORDER_ICONS[activity])return "clipboard";
 if(primary==="serviceOrders"&&isActivityType(activity))return SERVICE_ORDER_ICONS[activity]??"clipboard";
 return TOOLS[primary]??"dashboard";
}
