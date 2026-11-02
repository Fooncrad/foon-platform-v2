"use client";
import {useUiText} from "@/lib/i18n/ui-language";
import type {MenuGroup} from "@/lib/restaurant/menu";
export type CartLine={itemId:string;quantity:number;options:string[]};
export function choicesValid(groups:MenuGroup[],selected:string[]){const all=groups.flatMap(g=>g.values);if(new Set(selected).size!==selected.length||selected.some(id=>!all.some(v=>v.id===id&&(v.stock==null||v.stock>0))))return false;return groups.every(g=>{const n=selected.filter(id=>g.values.some(v=>v.id===id)).length;return n>=(g.required?Math.max(1,g.min):g.min)&&n<=(g.type==="single"?Math.min(1,g.max):g.max);});}
export function cartKey(itemId:string,options:string[]){return itemId+":"+[...options].sort().join(".");}
export function choicePrice(groups:MenuGroup[],selected:string[]){return groups.flatMap(g=>g.values).filter(v=>selected.includes(v.id)).reduce((n,v)=>n+v.price,0);}
export default function MenuChoices({groups,selected,onChange}:{groups:MenuGroup[];selected:string[];onChange:(ids:string[])=>void}){
 const translateUi=useUiText();

 return <div className="menuChoicePicker">{groups.map(group=><fieldset key={group.id}><legend>{group.name}{group.required?" *":""}</legend>{group.type==="single"?<select aria-label={translateUi("خيارات")+" "+group.name} value={selected.find(id=>group.values.some(v=>v.id===id))??""} onChange={e=>onChange([...selected.filter(id=>!group.values.some(v=>v.id===id)),...(e.target.value?[e.target.value]:[])])}><option value="">{translateUi("اختر")} {group.name}</option>{group.values.map(v=><option key={v.id} value={v.id} disabled={v.stock!==undefined&&v.stock!==null&&v.stock<=0}>{v.name}{v.price?" ("+(v.price>0?"+":"")+v.price.toFixed(2)+")":""}</option>)}</select>:group.values.map(v=><label key={v.id}><input type="checkbox" checked={selected.includes(v.id)} disabled={v.stock!==undefined&&v.stock!==null&&v.stock<=0} onChange={e=>onChange(e.target.checked?[...selected,v.id]:selected.filter(id=>id!==v.id))}/><span>{v.name}{v.price?" ("+(v.price>0?"+":"")+v.price.toFixed(2)+")":""}</span></label>)}</fieldset>)}</div>;
}
