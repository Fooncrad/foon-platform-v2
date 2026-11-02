// Keep image choices, cart preselection, and server-authorized combinations aligned.
// This module only handles selection identity; authoritative price/stock comes from
// the cart API and is checked again when the customer places an order.
export type CartVariant={id:string;options:string[];stock:number|null};
export type CartChoiceGroup={type:string;required:boolean;min:number;max:number;values:{id:string;stock?:number|null}[]};
export function sameOptionSet(left:readonly string[],right:readonly string[]):boolean{
 return left.length===right.length&&new Set(left).size===left.length&&new Set(right).size===right.length&&left.every(id=>right.includes(id));
}
export function findSelectedVariant<T extends CartVariant>(variants:readonly T[],selected:readonly string[]):T|undefined{
 return variants.find(variant=>sameOptionSet(variant.options,selected));
}

// Null means unlimited. Zero means unavailable. All option-value stock applies
// independently of combination stock; the server rechecks in its transaction.
export function selectedCatalogStockLimit(
 groups:readonly CartChoiceGroup[],variants:readonly CartVariant[],selected:readonly string[],productStock:number|null=null
):number|null{
 if(new Set(selected).size!==selected.length||productStock!==null&&(!Number.isFinite(productStock)||productStock<0))return 0;
 let limit=productStock;
 const values=groups.flatMap(group=>group.values);
 for(const id of selected){
  const value=values.find(value=>value.id===id);
  if(!value)return 0;
  if(value.stock!==undefined&&value.stock!==null){
   if(!Number.isFinite(value.stock)||value.stock<=0)return 0;
   limit=limit===null?value.stock:Math.min(limit,value.stock);
  }
 }
 if(variants.length){
  const matched=findSelectedVariant(variants,selected);
  if(!matched||matched.stock!==null&&(!Number.isFinite(matched.stock)||matched.stock<=0))return 0;
  if(matched.stock!==null)limit=limit===null?matched.stock:Math.min(limit,matched.stock);
 }
 return limit;
}
// When the customer already has several combinations in the cart, the same
// physical product and option stocks are shared across those cart lines.
export function remainingCatalogStock(
 groups:readonly CartChoiceGroup[],variants:readonly CartVariant[],selected:readonly string[],
 productStock:number|null,existing:readonly {options:string[];quantity:number}[]
):number|null{
 const bound=selectedCatalogStockLimit(groups,variants,selected,productStock);
 if(bound===0)return 0;
 let remaining=bound;
 const reduce=(stock:number,used:number)=>{
  const left=Math.max(0,stock-used);
  remaining=remaining===null?left:Math.min(remaining,left);
 };
 if(productStock!==null)reduce(productStock,existing.reduce((n,line)=>n+line.quantity,0));
 const values=groups.flatMap(group=>group.values);
 for(const id of selected){
  const stock=values.find(value=>value.id===id)?.stock;
  if(stock!==undefined&&stock!==null)reduce(stock,existing.filter(line=>line.options.includes(id)).reduce((n,line)=>n+line.quantity,0));
 }
 if(variants.length){
  const matched=findSelectedVariant(variants,selected);
  if(!matched)return 0;
  if(matched.stock!==null)reduce(matched.stock,existing.filter(line=>sameOptionSet(line.options,selected)).reduce((n,line)=>n+line.quantity,0));
 }
 return remaining;
}
export function defaultCatalogAddQuantity(measured:boolean,remaining:number|null):number{
 if(!measured)return 1;
 const available=Math.min(1,remaining??1);
 return Math.floor((available+1e-9)*1000)/1000;
}
export function canAddCatalogUnit(
 groups:readonly CartChoiceGroup[],variants:readonly CartVariant[],selected:readonly string[],
 productStock:number|null,existing:readonly {options:string[];quantity:number}[],quantity=1
):boolean{
 if(!Number.isFinite(quantity)||quantity<=0)return false;
 const remaining=remainingCatalogStock(groups,variants,selected,productStock,existing);
 return remaining===null||remaining+1e-9>=quantity;
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
 if(!valid||selectedCatalogStockLimit(groups,variants,selected)===0)return [];
 return [...selected];
}
