"use client";
import {useState,type ReactNode} from "react";
type Language="ar"|"en"|"fr";
type Props={language:Language;counts:{all:number;active:number;finished:number;cancelled:number};children:ReactNode};
type Phase="all"|"active"|"finished"|"cancelled";
export default function CustomerOrderFilter({language,counts,children}:Props){
 const [phase,setPhase]=useState<Phase>("all");
 const t=(ar:string,en:string,fr:string)=>language==="en"?en:language==="fr"?fr:ar;
 const options:{id:Phase;label:string}[]=[
 {id:"all",label:t("الكل","All","Toutes")},{id:"active",label:t("قيد التنفيذ","In progress","En cours")},{id:"finished",label:t("مكتملة","Completed","Terminées")},{id:"cancelled",label:t("ملغاة أو مرفوضة","Cancelled","Annulées")}
 ];
 return <div className="customerOrderFiltered" data-filter={phase}>
  <div className="customerOrderFilterButtons" role="group" aria-label={t("تصفية الطلبات حسب الحالة","Filter orders by status","Filtrer les commandes")}>
   {options.map(option=><button type="button" key={option.id} aria-pressed={phase===option.id} onClick={()=>setPhase(option.id)}>{option.label} <span dir="ltr">{counts[option.id].toLocaleString("en-US")}</span></button>)}
  </div>
  <p className="customerFilterFeedback" role="status">{t("النتائج المعروضة: ","Showing: ","Résultats : ")}{counts[phase].toLocaleString("en-US")}</p>
  {counts[phase]===0&&<p className="customerFilterEmpty">{t("لا توجد طلبات في هذا التصنيف. اختر «الكل» لعرض الطلبات الأخرى.","No orders in this category. Select All to view the others.","Aucune commande ici. Choisissez Toutes pour les autres.")}</p>}
  <div className="customerOrderList">{children}</div>
 </div>;
}
