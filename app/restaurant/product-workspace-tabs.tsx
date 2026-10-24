"use client";
import {useState,type ReactNode} from "react";
import styles from "./product-workspace-tabs.module.css";

type Tab={id:string;label:string;content:ReactNode};
export default function ProductWorkspaceTabs({tabs,initialTab="items",title,description}:{tabs:Tab[];initialTab?:string;title?:string;description?:string}){
 const [selected,setSelected]=useState(initialTab);
 const active=tabs.find(tab=>tab.id===selected)??tabs[0];
 if(!active)return null;
 return <section className={styles.workspace} aria-label={title}>
  {(title||description)&&<header className={styles.heading}>{title&&<h2>{title}</h2>}{description&&<p>{description}</p>}</header>}
  <nav className={styles.tabs} role="tablist" aria-label={title}>
   {tabs.map(tab=><button key={tab.id} type="button" id={"foon-workspace-tab-"+tab.id} role="tab" aria-selected={active.id===tab.id} aria-controls={"foon-workspace-panel-"+tab.id} tabIndex={active.id===tab.id?0:-1} className={active.id===tab.id?styles.active:""} onClick={()=>setSelected(tab.id)}>{tab.label}</button>)}
  </nav>
  {tabs.map(tab=><section key={tab.id} id={"foon-workspace-panel-"+tab.id} role="tabpanel" aria-labelledby={"foon-workspace-tab-"+tab.id} hidden={active.id!==tab.id} className={styles.panel}>{tab.content}</section>)}
 </section>;
}
