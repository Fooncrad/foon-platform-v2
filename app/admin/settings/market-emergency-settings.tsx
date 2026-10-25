"use client";
import {useEffect,useState} from "react";
import type {MarketGate} from "@/lib/market/global-gate";
const defaultMarketGate:MarketGate={closed:false,reason:{ar:"السوق قريبًا",en:"Marketplace coming soon",fr:"Le marché arrive bientôt"}};
import {useUiLanguage} from "@/lib/i18n/ui-language";
export default function MarketEmergencySettings({canEdit}:{canEdit:boolean}){
 const lang=useUiLanguage(),[settings,setSettings]=useState<MarketGate>(defaultMarketGate),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState("");
 const t=(ar:string,en:string,fr:string)=>lang==="ar"?ar:lang==="en"?en:fr;
 useEffect(()=>{let active=true;fetch("/api/admin/market-gate",{cache:"no-store"}).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(j=>{if(active&&j.ok)setSettings(j.settings)}).catch(()=>{if(active)setMessage(t("تعذر قراءة حالة السوق","Unable to load marketplace status","Chargement du marché impossible"))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
 async function save(){setSaving(true);setMessage("");try{const r=await fetch("/api/admin/market-gate",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({settings})});if(!r.ok)throw Error();setMessage(t("تم تطبيق حالة السوق وتسجيل العملية","Marketplace status saved and audited","État du marché enregistré"))}catch{setMessage(t("تعذر تغيير حالة السوق","Failed to update marketplace","Mise à jour impossible"))}finally{setSaving(false)}}
 return <section className="adminPanel adminOperationsPanel" style={{padding:20}}><h2>{t("إيقاف السوق العام عند الضرورة","Marketplace emergency control","Contrôle d’urgence du marché")}</h2><p>{t("عند الإيقاف تظهر صفحة «قريبًا» للزوار، وتبقى روابط المتاجر المباشرة والطلبات والدفع فعّالة.","A Coming Soon page replaces the marketplace only. Direct storefronts, orders and payments remain available.","Une page « Bientôt » remplace uniquement le marché.")}</p>
 {loading?<p>{t("جار التحميل","Loading","Chargement")}</p>:<><label style={{display:"flex",alignItems:"center",gap:12}}><input type="checkbox" disabled={!canEdit||saving} checked={settings.closed} onChange={e=>setSettings(s=>({...s,closed:e.target.checked}))}/><strong>{t("إغلاق واجهة السوق وعرض «قريبًا»","Close marketplace and show Coming Soon","Fermer le marché et afficher « Bientôt »")}</strong></label>
 {(["ar","en","fr"] as const).map((locale,i)=><label key={locale} style={{display:"grid",margin:"12px 0",gap:5}}>{["رسالة عربي","English message","Message français"][i]}<textarea rows={2} maxLength={300} disabled={!canEdit||saving} value={settings.reason[locale]} onChange={e=>setSettings(s=>({...s,reason:{...s.reason,[locale]:e.target.value}}))}/></label>)}
 {canEdit&&<button type="button" disabled={saving} onClick={save}>{saving?t("جار الحفظ","Saving","Enregistrement"):t("حفظ وتطبيق الحالة","Save and apply","Enregistrer et appliquer")}</button>} <a href="/market" target="_blank" rel="noopener noreferrer">{t("معاينة السوق","View marketplace","Voir le marché")}</a></>}
 {message&&<p role="status">{message}</p>}</section>;
}
