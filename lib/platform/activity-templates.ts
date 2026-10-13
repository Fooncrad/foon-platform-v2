import {isActivityType,type ActivityType} from "./activity-presets";

/** Activity-specific storefront choices. Legacy menu themes remain available to restaurants. */
export const ACTIVITY_TEMPLATES={
 restaurant:["sufra","classic","minimal","modern"],
 cafe:["coffee-bar","coffee-gallery"],
 sweets:["bakery-showcase","occasion-boxes"],
 grocery:["market-grid","market-offers"],
 clothing:["fashion-editorial","fashion-grid"],
 perfume:["fragrance-boutique","fragrance-collection"],
 accessories:["accessories-grid","watch-showcase"],
 gifts:["gift-gallery","gift-occasion"],
 ecommerce:["commerce-grid","commerce-featured"],
 carwash:["wash-services","wash-packages"],
 laundry:["laundry-services","laundry-pickup"],
 automotive:["auto-services","auto-booking"],
 salon:["salon-services","salon-booking"],
 publicworks:["projects-portfolio","service-quotation"]
} as const satisfies Record<ActivityType,readonly string[]>;
export type ActivityTemplate=typeof ACTIVITY_TEMPLATES[ActivityType][number];
export function templatesForActivity(activity:string):readonly string[]{
 return isActivityType(activity)?ACTIVITY_TEMPLATES[activity]:[];
}
export function isTemplateForActivity(activity:string,template:string):boolean{
 return templatesForActivity(activity).includes(template);
}
export function defaultTemplateForActivity(activity:string):string|null{
 return templatesForActivity(activity)[0]??null;
}
