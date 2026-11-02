"use client";

import {useEffect, useState} from "react";

/** Compact navigation for public storefronts across every activity. */
export default function StorefrontScrollArrows() {
 const [position,setPosition]=useState({canUp:false,canDown:false});
 useEffect(()=>{
  let frame=0;
  const update=()=>{
   cancelAnimationFrame(frame);
   frame=requestAnimationFrame(()=>{
    const root=document.scrollingElement??document.documentElement;
    const max=Math.max(0,root.scrollHeight-root.clientHeight);
    setPosition({canUp:root.scrollTop>120,canDown:root.scrollTop<max-120&&max>120});
   });
  };
  update();
  window.addEventListener("scroll",update,{passive:true});
  window.addEventListener("resize",update);
  const observer=new ResizeObserver(update);
  observer.observe(document.body);
  return ()=>{cancelAnimationFrame(frame);window.removeEventListener("scroll",update);window.removeEventListener("resize",update);observer.disconnect()};
 },[]);
 const scroll=(to:"top"|"bottom")=>{
  const root=document.scrollingElement??document.documentElement;
  window.scrollTo({top:to==="top"?0:root.scrollHeight,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
 };
 if(!position.canUp&&!position.canDown)return null;
 return <nav className="foon-storefront-scroll-arrows" aria-label="التنقل داخل الصفحة / Page navigation / Navigation de page">
  {position.canUp&&<button type="button" onClick={()=>scroll("top")} aria-label="العودة إلى أعلى الصفحة / Scroll to top / Retour en haut" title="العودة إلى الأعلى" className="foon-storefront-scroll-arrow">↑</button>}
  {position.canDown&&<button type="button" onClick={()=>scroll("bottom")} aria-label="الانتقال إلى أسفل الصفحة / Scroll to bottom / Aller en bas" title="النزول إلى الأسفل" className="foon-storefront-scroll-arrow">↓</button>}
 </nav>;
}
