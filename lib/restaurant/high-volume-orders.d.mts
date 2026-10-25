export type TrafficOrder={status:string;created_at:string};
export const HIGH_VOLUME_PER_MINUTE:number;
export const HIGH_VOLUME_ACTIVE_COUNT:number;
export const HIGH_VOLUME_PAGE_SIZE:number;
export function orderTrafficSnapshot<T extends TrafficOrder>(orders:readonly T[],now?:number):{perMinute:number;active:number};
export function resolveOrdersDisplay<T extends TrafficOrder>(mode:"auto"|"cards"|"dense",orders:readonly T[],now?:number):"cards"|"dense";
export function activeKitchenOrders<T extends TrafficOrder>(orders:readonly T[]):T[];
export function orderPage<T>(orders:readonly T[],visible?:number):T[];
