"use client";
import {useRef,useState,type KeyboardEvent,type ReactNode} from "react";
import styles from "./product-workspace-tabs.module.css";
import {MerchantIcon} from "./merchant-icon";

type Tab={id:string;label:string;content:ReactNode;help?:string;icon?:string};
const TAB_ICONS:Record<string,string>={items:"box",categories:"store",groups:"sliders",values:"plus",images:"image",appearance:"film"};
/** Shared product workspace tab behavior across all activity types and locales.
 * Arrow keys, Home and End navigate without losing the editor's selected state.
 */
export default function ProductWorkspaceTabs({tabs,initialTab="items",title,description}:{tabs:Tab[];initialTab?:string;title?:string;description?:string}){
 const [selected,setSelected]=useState(initialTab);
 const buttons=useRef<Array<HTMLButtonElement|null>>([]);
 const active=tabs.find(tab=>tab.id===selected)??tabs[0];
 if(!active)return null;
 function move(event:KeyboardEvent<HTMLElement>){
  if(!["ArrowRight","ArrowLeft","Home","End"].includes(event.key))return;
  if(!(event.target instanceof HTMLButtonElement)||event.target.getAttribute("role")!=="tab")return;
  const current=tabs.findIndex(tab=>tab.id===active.id);
  const rtl=event.currentTarget.closest('[dir="rtl"]')!==null;
  const forward=event.key==="ArrowRight"?!rtl:rtl;
  const next=event.key==="Home"?0:event.key==="End"?tabs.length-1:
   (current+(forward?1:-1)+tabs.length)%tabs.length;
  event.preventDefault();
  setSelected(tabs[next].id);
  buttons.current[next]?.focus();
 }
 return <section className={styles.workspace} aria-label={title}>
  {(title||description)&&<header className={styles.heading}>{title&&<h2>{title}</h2>}{description&&<p>{description}</p>}</header>}
  <nav className={styles.tabs} role="tablist" aria-orientation="horizontal" aria-label={title} onKeyDown={move}>
   {tabs.map((tab,i)=><button key={tab.id} ref={node=>{buttons.current[i]=node}} type="button" id={"foon-workspace-tab-"+tab.id} role="tab" aria-selected={active.id===tab.id} aria-controls={"foon-workspace-panel-"+tab.id} tabIndex={active.id===tab.id?0:-1} className={active.id===tab.id?styles.active:""} onClick={()=>setSelected(tab.id)}><span className={styles.tabIcon}><MerchantIcon name={tab.icon??TAB_ICONS[tab.id]??"box"}/></span><span className={styles.tabLabel}>{tab.label}</span><span className={styles.selectedMark} aria-hidden="true"/></button>)}
  </nav>
  {active.help&&<p className={styles.activeDescription} role="status"><span aria-hidden="true" className={styles.activeDot}/>{active.help}</p>}
  {tabs.map(tab=><section key={tab.id} id={"foon-workspace-panel-"+tab.id} role="tabpanel" tabIndex={0} aria-labelledby={"foon-workspace-tab-"+tab.id} hidden={active.id!==tab.id} className={styles.panel}>{active.id===tab.id?tab.content:null}</section>)}
 </section>;
}
