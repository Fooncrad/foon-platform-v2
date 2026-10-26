"use client";
import {useEffect,useState} from "react";
import {useUiLanguage} from "@/lib/i18n/ui-language";
import {defaultQrBranding,parseQrBranding,type QrBranding} from "@/lib/platform/qr-branding";
import BrandedQr from "@/app/components/branded-qr";
export default function PlatformQrIdentitySettings({canEdit}:{canEdit:boolean}){
 const lang=useUiLanguage(),[value,setValue]=useState<QrBranding>(defaultQrBranding),[notice,setNotice]=useState(""),[saving,setSaving]=useState(false);
 const tr=(ar:string,en:string,fr:string)=>lang==="ar"?ar:lang==="en"?en:fr;
 useEffect(()=>{let active=true;fetch("/api/admin/qr-branding",{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject()).then(j=>{const settings=parseQrBranding(j.settings);if(active&&settings)setValue(settings)}).catch(()=>{if(active)setNotice(tr("تعذر تحميل هوية QR","Could not load QR identity","Chargement impossible"))});return()=>{active=false}},[]);
 const change=(patch:Partial<QrBranding>)=>setValue(old=>({...old,...patch}));
 async function save(){setSaving(true);setNotice("");try{const r=await fetch("/api/admin/qr-branding",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({settings:value})});if(!r.ok)throw Error();setNotice(tr("حُفظت هوية QR الخاصة بالمنصة","Platform QR identity saved","Identité QR enregistrée"))}catch{setNotice(tr("تعذر الحفظ","Save failed","Échec de sauvegarde"))}finally{setSaving(false)}}
 return <section className="adminPanel adminOperationsPanel"><h2>{tr("هوية QR للمنصة","Platform QR identity","Identité QR de la plateforme")}</h2><p>{tr("تُطبق إعدادات الهوية العامة على QR المنصة أسفل الهيدر.","These settings style the QR below the site header.","Ces paramètres personnalisent le QR sous l'en-tête.")}</p><div className="adminOpsForm">
 <label>{tr("لون الرمز","Code color","Couleur du code")}<input disabled={!canEdit} type="color" value={value.ink} onChange={e=>change({ink:e.target.value})}/></label>
 <label>{tr("الخلفية","Background","Fond")}<input disabled={!canEdit} type="color" value={value.paper} onChange={e=>change({paper:e.target.value})}/></label>
 <label>{tr("الحجم","Size","Taille")}<select disabled={!canEdit} value={value.size} onChange={e=>change({size:Number(e.target.value) as QrBranding["size"]})}>{[200,240,300].map(n=><option key={n}>{n}</option>)}</select></label>
 <label>{tr("شكل الإطار","Frame","Cadre")}<select disabled={!canEdit} value={value.frame} onChange={e=>change({frame:e.target.value as QrBranding["frame"]})}><option value="plain">Plain</option><option value="rounded">Rounded</option><option value="gold">Gold</option></select></label>
 {(["captionAr","captionEn","captionFr"] as const).map((k,i)=><label key={k}>{["العربية","English","Français"][i]}<input disabled={!canEdit} maxLength={80} value={value[k]} onChange={e=>change({[k]:e.target.value})}/></label>)}
 <label><input disabled={!canEdit} type="checkbox" checked={value.showLogo} onChange={e=>change({showLogo:e.target.checked})}/>{tr("إظهار شعار المنصة","Show platform logo","Afficher le logo")}</label>
 </div><div style={{display:"flex",gap:12,marginTop:14,flexWrap:"wrap"}}>{canEdit&&<button disabled={saving} onClick={save}>{tr("حفظ الهوية","Save identity","Enregistrer")}</button>}<BrandedQr scope="platform" title="FOON" language={lang}/></div>{notice&&<p role="status">{notice}</p>}</section>
}
