"use client";
import {useEffect,useState} from "react";
import {emptyLandingSettings,landingFields,type LandingSettings,type LandingLanguage} from "@/lib/platform/landing-fields";
const labels:Record<string,string>={badge:"شارة المقدمة",title:"العنوان الرئيسي",lead:"الوصف الرئيسي",start:"زر التسجيل",market:"زر السوق",features:"عنوان المميزات",featuresText:"وصف المميزات",stepsTitle:"عنوان خطوات التشغيل",footer:"نص التذييل",card1Title:"الميزة الأولى",card1Body:"وصف الميزة الأولى",card2Title:"الميزة الثانية",card2Body:"وصف الميزة الثانية",card3Title:"الميزة الثالثة",card3Body:"وصف الميزة الثالثة",step1Title:"الخطوة الأولى",step1Body:"وصف الخطوة الأولى",step2Title:"الخطوة الثانية",step2Body:"وصف الخطوة الثانية",step3Title:"الخطوة الثالثة",step3Body:"وصف الخطوة الثالثة"};
const tr={ar:{title:"محرر واجهة الموقع",hint:"تحرير محتوى الصفحة الرئيسية بكل اللغات. احفظ مسودة أولًا ثم انشر عند الاعتماد.",draft:"حفظ مسودة",publish:"نشر التعديلات",preview:"معاينة الموقع",image:"رابط صورة المقدمة HTTPS",features:"إظهار المميزات",plans:"إظهار الباقات",steps:"إظهار خطوات التشغيل",saved:"تم الحفظ",error:"تعذر الحفظ أو تحميل المحتوى",loading:"جار تحميل المحتوى"},en:{title:"Homepage editor",hint:"Edit the homepage in every language. Save a draft and publish when ready.",draft:"Save draft",publish:"Publish changes",preview:"Preview website",image:"HTTPS hero image URL",features:"Show features",plans:"Show plans",steps:"Show steps",saved:"Saved",error:"Could not save or load content",loading:"Loading content"},fr:{title:"Éditeur d’accueil",hint:"Modifiez l’accueil dans toutes les langues. Enregistrez un brouillon avant publication.",draft:"Enregistrer le brouillon",publish:"Publier",preview:"Voir le site",image:"URL HTTPS de l’image",features:"Afficher les fonctions",plans:"Afficher les offres",steps:"Afficher les étapes",saved:"Enregistré",error:"Chargement ou sauvegarde impossible",loading:"Chargement"}} as const;
export default function LandingEditor({canEdit}:{canEdit:boolean}){
 const [settings,setSettings]=useState<LandingSettings>(emptyLandingSettings());
 const [lang,setLang]=useState<LandingLanguage>("ar"),[ui,setUi]=useState<LandingLanguage>("ar");
 const [status,setStatus]=useState(""),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
 useEffect(()=>{let active=true;fetch("/api/admin/landing-editor",{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok||!d.ok)throw Error();if(active){setSettings(d.draft&&Object.values(d.draft.text??{}).some((x)=>Object.keys(x as object).length)?d.draft:d.published);setReady(true);}}).catch(()=>{if(active)setStatus(tr[ui].error)});return()=>{active=false}},[]);
 const t=tr[ui];
 const update=(key:string,value:string)=>setSettings(old=>({...old,text:{...old.text,[lang]:{...old.text[lang],[key]:value}}}));
 const save=async(next:"draft"|"published")=>{setBusy(true);setStatus("");try{const r=await fetch("/api/admin/landing-editor",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:next,content:settings})});if(!r.ok)throw Error();setStatus(t.saved)}catch{setStatus(t.error)}finally{setBusy(false)}};
 return <div dir={ui==="ar"?"rtl":"ltr"} style={{maxWidth:1100,margin:"auto",padding:"20px 12px"}}>
 <h1>{t.title}</h1><p>{t.hint}</p>
 <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:24}}>
 <label>UI <select value={ui} onChange={e=>setUi(e.target.value as LandingLanguage)}><option value="ar">العربية</option><option value="en">English</option><option value="fr">Français</option></select></label>
 <label>Content <select value={lang} onChange={e=>setLang(e.target.value as LandingLanguage)}><option value="ar">العربية</option><option value="en">English</option><option value="fr">Français</option></select></label>
 <a href="/" target="_blank" rel="noopener noreferrer">{t.preview}</a>
 </div>
 {!ready?<p role="status">{status||t.loading}</p>:<form onSubmit={e=>e.preventDefault()}>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,320px),1fr))",gap:16}}>
 {landingFields.map(key=><label key={key} style={{display:"grid",gap:6}}><strong>{labels[key]} ({lang})</strong><textarea dir={lang==="ar"?"rtl":"ltr"} rows={key.endsWith("Body")||key==="lead"?3:2} maxLength={3000} disabled={!canEdit||busy} value={settings.text[lang][key]??""} onChange={e=>update(key,e.target.value)} placeholder={ui==="ar"?"فارغ = النص الافتراضي":"Empty = default text"} style={{width:"100%",padding:10,borderRadius:8}}/></label>)}
 </div><hr style={{margin:"20px 0"}}/>
 <label style={{display:"grid",gap:8}}>{t.image}<input dir="ltr" type="url" value={settings.heroImage} placeholder="https://..." disabled={!canEdit||busy} onChange={e=>setSettings(s=>({...s,heroImage:e.target.value}))}/></label>
 {([["showFeatures","features"],["showPlans","plans"],["showSteps","steps"]] as const).map(([k,label])=><label key={k} style={{display:"inline-flex",gap:8,padding:14}}><input type="checkbox" checked={settings[k]} disabled={!canEdit||busy} onChange={e=>setSettings(s=>({...s,[k]:e.target.checked}))}/>{t[label]}</label>)}
 <div style={{display:"flex",gap:12,marginTop:20}}>{canEdit&&<><button type="button" disabled={busy} onClick={()=>save("draft")}>{t.draft}</button><button type="button" disabled={busy} onClick={()=>save("published")}>{t.publish}</button></>}</div><p role="status">{status}</p></form>}</div>;
}