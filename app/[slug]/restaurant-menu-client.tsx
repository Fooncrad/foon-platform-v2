"use client";
import {useMemo,useState} from "react";
type Category={id:string;name:string};
type Item={id:string;category_id:string;name:string;description:string|null;price:number;currency:string};
export default function RestaurantMenuClient({categories,items}:{categories:Category[];items:Item[]}){
 const [active,setActive]=useState("all");
 const [layout,setLayout]=useState<"grid"|"list">("grid");
 const visible=useMemo(()=>active==="all"?items:items.filter(item=>item.category_id===active),[items,active]);
 return <div className="foonReferenceMenu">
 <div className="foonReferenceMenuBar"><nav className="foonReferenceCategories" aria-label="أقسام المنيو"><button type="button" className={active==="all"?"active":""} onClick={()=>setActive("all")}>الكل</button>{categories.map(c=><button type="button" key={c.id} className={active===c.id?"active":""} onClick={()=>setActive(c.id)}>{c.name}</button>)}</nav><div className="foonReferenceLayout" role="group" aria-label="طريقة عرض الأصناف"><button type="button" aria-pressed={layout==="grid"} onClick={()=>setLayout("grid")} title="عرض شبكي">▦</button><button type="button" aria-pressed={layout==="list"} onClick={()=>setLayout("list")} title="عرض قائمة">☷</button></div></div>
 <div className={layout==="grid"?"foonReferenceCards":"foonReferenceCards is-list"}>{visible.map(item=><article className="foonReferenceCard" key={item.id}><div className="foonReferenceCardImage" aria-hidden="true"></div><div className="foonReferenceCardContent"><h3>{item.name}</h3>{item.description&&<p>{item.description}</p>}<strong dir="ltr">{item.price.toFixed(2)} {item.currency}</strong></div></article>)}</div>
 {visible.length===0&&<p className="foonReferenceEmpty">لا توجد أصناف منشورة في هذا القسم حاليًا.</p>}
 </div>;
}
