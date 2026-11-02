/** Free distance-based delivery with user-consented browser coordinates.
 * Great-circle distance (Haversine), NOT a road-distance or geocoding service.
 * No Google Maps key or external location API is required.
 */
export type DeliveryMode="manual"|"radius";
export type TenantLocationSettings={
 deliveryMode:DeliveryMode;
 latitude:number|null;longitude:number|null;radiusKm:number|null;
 outsideMessage:string;googleAnalyticsId:string;facebookPixelId:string;
 aiAssistantRequested:boolean;
};
export const defaultLocationSettings:TenantLocationSettings={
 deliveryMode:"manual",latitude:null,longitude:null,radiusKm:null,
 outsideMessage:"",googleAnalyticsId:"",facebookPixelId:"",
 aiAssistantRequested:false
};
export function validPoint(latitude:unknown,longitude:unknown):boolean{
 return typeof latitude==="number"&&typeof longitude==="number"
  &&Number.isFinite(latitude)&&Number.isFinite(longitude)
  &&latitude>=-90&&latitude<=90&&longitude>=-180&&longitude<=180;
}
export function greatCircleKm(lat1:number,lon1:number,lat2:number,lon2:number){
 const rad=Math.PI/180,dLat=(lat2-lat1)*rad,dLon=(lon2-lon1)*rad;
 const a=Math.sin(dLat/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLon/2)**2;
 return 6371.0088*2*Math.atan2(Math.sqrt(Math.min(1,a)),Math.sqrt(Math.max(0,1-a)));
}
/** Reject malformed input, don't silently replace a radius rule with manual. */
export function parseLocationSettings(input:unknown):TenantLocationSettings|null{
 if(!input||typeof input!=="object"||Array.isArray(input))return null;
 const b=input as Record<string,unknown>;
 if(!["manual","radius"].includes(String(b.deliveryMode)))return null;
 const mode=b.deliveryMode as DeliveryMode;
 const lat=b.latitude===null||b.latitude===""?null:Number(b.latitude);
 const lon=b.longitude===null||b.longitude===""?null:Number(b.longitude);
 const radius=b.radiusKm===null||b.radiusKm===""?null:Number(b.radiusKm);
 if((lat===null)!==(lon===null))return null;
 if(lat!==null&&!validPoint(lat,lon))return null;
 if(radius!==null&&(!Number.isFinite(radius)||radius<=0||radius>500))return null;
 if(mode==="radius"&&(lat===null||lon===null||radius===null))return null;
 if(typeof b.outsideMessage!=="string"||b.outsideMessage.length>240
  ||typeof b.googleAnalyticsId!=="string"||typeof b.facebookPixelId!=="string"
  ||typeof b.aiAssistantRequested!=="boolean")return null;
 const ga=b.googleAnalyticsId.trim().toUpperCase(),pixel=b.facebookPixelId.trim();
 if(ga&&!/^G-[A-Z0-9]{4,16}$/.test(ga))return null;
 if(pixel&&!/^\d{8,25}$/.test(pixel))return null;
 return {deliveryMode:mode,latitude:lat,longitude:lon,radiusKm:radius,
  outsideMessage:b.outsideMessage.trim(),googleAnalyticsId:ga,
  facebookPixelId:pixel,aiAssistantRequested:b.aiAssistantRequested};
}
/** Checked server-side before accepting a delivery order. GPS is an approximate
 * user-provided coordinate; it cannot prove customer identity or street access.
 */
export function deliveryZoneCheck(settings:Pick<TenantLocationSettings,"deliveryMode"|"latitude"|"longitude"|"radiusKm">,lat:unknown,lon:unknown):
 {allowed:true;distanceKm?:number}|{allowed:false;code:"DELIVERY_GPS_REQUIRED"|"DELIVERY_OUT_OF_RANGE"}{
 if(settings.deliveryMode!=="radius")return {allowed:true};
 if(!validPoint(settings.latitude,settings.longitude)||settings.radiusKm===null
  ||settings.radiusKm<=0)return {allowed:false,code:"DELIVERY_GPS_REQUIRED"};
 if(!validPoint(lat,lon))return {allowed:false,code:"DELIVERY_GPS_REQUIRED"};
 const distanceKm=greatCircleKm(Number(settings.latitude),Number(settings.longitude),Number(lat),Number(lon));
 if(distanceKm>settings.radiusKm)return {allowed:false,code:"DELIVERY_OUT_OF_RANGE"};
 return {allowed:true,distanceKm};
}
