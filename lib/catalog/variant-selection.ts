// Keep image choices, cart preselection, and server-authorized combinations aligned.
// This module only handles selection identity; authoritative price/stock comes from
// the cart API and is checked again when the customer places an order.
export type CartVariant={id:string;options:string[];stock:number|null};
export type CartChoiceGroup={type:string;required:boolean;min:number;max:number;values:{id:string}[]};
export function sameOptionSet(left:readonly string[],right:readonly string[]):boolean{
 return left.length===right.length&&new Set(left).size===left.length&&new Set(right).size===right.length&&left.every(id=>right.includes(id));
}
export function findSelectedVariant<T extends CartVariant>(variants:readonly T[],selected:readonly string[]):T|undefined{
 return variants.find(variant=>sameOptionSet(variant.options,selected));
}
export function validPreselectedOptions(requested:unknown,groups:readonly CartChoiceGroup[],variants:readonly CartVariant[]):string[]{
 if(!Array.isArray(requested)||requested.length>20||requested.some(value=>typeof value!=="string"||!/^[-a-f0-9]{36}$/i.test(value))||new Set(requested).size!==requested.length)return [];
 const selected=requested as string[];
 const all=groups.flatMap(group=>group.values.map(value=>value.id));
 if(selected.some(id=>!all.includes(id)))return [];
 const valid=groups.every(group=>{
  const count=selected.filter(id=>group.values.some(value=>value.id===id)).length;
  return count>=(group.required?Math.max(1,group.min):group.min)&&count<=(group.type==="single"?Math.min(1,group.max):group.max);
 });
 if(!valid||variants.length>0&&(!findSelectedVariant(variants,selected)||((findSelectedVariant(variants,selected)?.stock??null)!==null&&Number(findSelectedVariant(variants,selected)?.stock)<=0)))return [];
 return [...selected];
}
