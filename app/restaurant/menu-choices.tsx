"use client";
import type {MenuGroup} from "@/lib/restaurant/menu";
export type CartLine={itemId:string;quantity:number;options:string[]};
export function choicesValid(groups:MenuGroup[],selected:string[]){return groups.every(g=>{const n=selected.filter(id=>g.values.some(v=>v.id===id)).length;return n>=(g.required?Math.max(1,g.min):g.min)&&n<=(g.type==="single"?Math.min(1,g.max):g.max);});}
export function cartKey(itemId:string,options:string[]){return itemId+":"+[...options].sort().join(".");}
export function choicePrice(groups:MenuGroup[],selected:string[]){return groups.flatMap(g=>g.values).filter(v=>selected.includes(v.id)).reduce((n,v)=>n+v.price,0);}
export default function MenuChoices({groups,selected,onChange}:{groups:MenuGroup[];selected:string[];onChange:(ids:string[])=>void}){
 return <div className="menuChoicePicker">{groups.map(group=><fieldset key={group.id}><legend>{group.name}{group.required?" *":""}</legend>{group.type==="single"?<select aria-label={"خيارات "+group.name} value={selected.find(id=>group.values.some(v=>v.id===id))??""} onChange={e=>onChange([...selected.filter(id=>!group.values.some(v=>v.id===id)),...(e.target.value?[e.target.value]:[])])}><option value="">اختر {group.name}</option>{group.values.map(v=><option key={v.id} value={v.id}>{v.name}{v.price?" ("+(v.price>0?"+":"")+v.price.toFixed(2)+")":""}</option>)}</select>:group.values.map(v=><label key={v.id}><input type="checkbox" checked={selected.includes(v.id)} onChange={e=>onChange(e.target.checked?[...selected,v.id]:selected.filter(id=>id!==v.id))}/><span>{v.name}{v.price?" ("+(v.price>0?"+":"")+v.price.toFixed(2)+")":""}</span></label>)}</fieldset>)}</div>;
}
