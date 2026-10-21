export type Point={latitude:number;longitude:number};
export type Branch=Point&{id:string;name?:string};
export function validLocation(value:unknown):value is Point;
export function distanceKm(a:Point,b:Point):number|null;
export function nearestDeliveryBranch(branches:Branch[],customer:Point|null,eligibleIds:string[]):{branch:Branch;distanceKm:number|null;approximate:boolean}|null;
