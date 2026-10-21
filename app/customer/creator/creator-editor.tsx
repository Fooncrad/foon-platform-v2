"use client";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import {useUiLanguage} from "@/lib/i18n/ui-language";
import Link from "next/link";
import CreatorSocialLinksEditor from "./social-links-editor";
import CreatorQr from "./creator-qr";
type Profile={handle:string;display_name:string;bio:string;visibility:"public"|"private"};
type Portfolio={id:string;media_id:string;caption:string;file_name:string};
type LibraryImage={id:string;name:string};
export default function CreatorEditor(){
 const language=useUiLanguage();
 const t=(ar:string,en:string,fr:string)=>language==="en"?en:language==="fr"?fr:ar;
 const [profile,setProfile]=useState<Profile>({handle:"",display_name:"",bio:"",visibility:"private"});
 const [saved,setSaved]=useState<Profile|null>(null),[portfolio,setPortfolio]=useState<Portfolio[]>([]);
 const [library,setLibrary]=useState<LibraryImage[]>([]),[selected,setSelected]=useState(""),[caption,setCaption]=useState("");
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 const load=useCallback(async()=>{
  const [p,l]=await Promise.all([fetch("/api/account/creator-profile",{cache:"no-store"}),fetch("/api/account/library",{cache:"no-store"})]);
  const d=await p.json(),images=await l.json();
  if(!p.ok||!l.ok||!d.ok||!images.ok||!Array.isArray(d.portfolio)||!Array.isArray(images.files))throw Error("LOAD_FAILED");
  const existing=(d.profile??null) as Profile|null;
  setSaved(existing);setProfile(existing??{handle:"",display_name:"",bio:"",visibility:"private"});
  setPortfolio(d.portfolio);
  setLibrary(images.files.map((f:LibraryImage)=>({id:f.id,name:f.name})));
 },[]);
 useEffect(()=>{let active=true;const get=async()=>{try{if(active)await load();}catch{if(active)setError(t("تعذر تحميل ملف صانع المحتوى.","Could not load creator profile.","Impossible de charger le profil créateur."));}finally{if(active)setLoading(false);}};void get();return()=>{active=false;};},[load]);
 async function save(event:FormEvent){
  event.preventDefault();setBusy(true);setMessage("");setError("");
  try{
   const r=await fetch("/api/account/creator-profile",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({handle:profile.handle,displayName:profile.display_name,bio:profile.bio,visibility:profile.visibility})});
   const d=await r.json();if(!r.ok)throw Error(d.code??"SAVE_FAILED");
   await load();setMessage(t("تم حفظ الملف وإعداد الخصوصية.","Profile and visibility saved.","Profil et visibilité enregistrés."));
  }catch(e){const msg=e instanceof Error?e.message:"SAVE_FAILED";setError(msg==="HANDLE_TAKEN"?t("هذا المعرف مستخدم، اختر معرفًا آخر.","Handle already taken.","Identifiant déjà pris."):t("تعذر الحفظ: ","Could not save: ","Enregistrement impossible : ")+msg);}finally{setBusy(false);}
 }
 async function addImage(){
  if(!saved||!selected)return;
  setBusy(true);setMessage("");setError("");
  try{
   const r=await fetch("/api/account/creator-profile",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mediaId:selected,caption})});
   const d=await r.json();if(!r.ok)throw Error(d.code??"UPLOAD_FAILED");
   await load();setSelected("");setCaption("");setMessage(t("أُضيفت الصورة إلى معرض أعمالك.","Image added to your portfolio.","Image ajoutée au portfolio."));
  }catch(e){setError(e instanceof Error?e.message:"PORTFOLIO_SAVE_FAILED");}finally{setBusy(false);}
 }
 async function remove(id:string){
  setBusy(true);setMessage("");setError("");
  try{
   const r=await fetch("/api/account/creator-profile",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id})});
   const d=await r.json();if(!r.ok)throw Error(d.code??"DELETE_FAILED");
   await load();setMessage(t("أُزيلت الصورة من ملف صانع المحتوى فقط.","Image removed from creator profile only.","Image retirée uniquement du profil créateur."));
  }catch(e){setError(e instanceof Error?e.message:"PORTFOLIO_DELETE_FAILED");}finally{setBusy(false);}
 }
 const publicUrl=saved?.visibility==="public"?"/creators/"+saved.handle:null;
 return <section className="creatorEditor">
  <header><h1>{t("ملفي كصانع محتوى","My creator profile","Mon profil créateur")}</h1><p>{t("ملفك مستقل عن المطاعم والمتاجر. حساب العميل نفسه يستخدم للتسوق ولصناعة المحتوى، دون إضافة نشاط تجاري أو دور موظف.","Your creator profile belongs to your customer account, not a merchant or staff role.","Votre profil créateur appartient à votre compte client, pas à un commerce ni à un employé.")}</p><p><Link href="/customer#account-settings">{t("تغيير صورتي الشخصية وصورة الغلاف","Edit my avatar and cover photo","Modifier ma photo et ma couverture")}</Link></p></header>
  {loading?<p role="status">{t("جارٍ التحميل...","Loading...","Chargement...")}</p>:<>
   <form onSubmit={save}>
    <label>{t("المعرف العام للرابط","Public handle","Identifiant public")}<input dir="ltr" required minLength={4} maxLength={40} pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{2,38}[a-zA-Z0-9]" autoCapitalize="none" value={profile.handle} onChange={e=>setProfile(v=>({...v,handle:e.target.value.toLowerCase()}))} placeholder="my-creative-name"/></label>
    <label>{t("اسم صانع المحتوى","Creator display name","Nom du créateur")}<input required minLength={2} maxLength={180} value={profile.display_name} onChange={e=>setProfile(v=>({...v,display_name:e.target.value}))}/></label>
    <label>{t("نبذة عن أعمالي","About my work","Présentation de mon travail")}<textarea rows={4} maxLength={1500} value={profile.bio} onChange={e=>setProfile(v=>({...v,bio:e.target.value}))}/></label>
    <fieldset><legend>{t("خصوصية الملف الشخصي","Profile visibility","Visibilité du profil")}</legend>
     <label><input type="radio" name="creator-visibility" checked={profile.visibility==="private"} onChange={()=>setProfile(v=>({...v,visibility:"private"}))}/> {t("خاص — لا يراه الزوار، حتى مع الرابط","Private — hidden even with a direct link","Privé — masqué même avec le lien")}</label>
     <label><input type="radio" name="creator-visibility" checked={profile.visibility==="public"} onChange={()=>setProfile(v=>({...v,visibility:"public"}))}/> {t("عام — ملفي ومعرض الصور المختارة مرئيان للجميع","Public — profile and chosen portfolio images visible to anyone","Public — profil et images choisies visibles à tous")}</label>
    </fieldset>
    <p className="creatorPrivacyHint">{t("الملف يبدأ خاصًا. لا تُعرض صور مكتبتك الشخصية إلا الصور التي تختار إضافتها إلى المعرض. التحويل إلى خاص يمنع فتح الملف والصور المنشورة عبر الروابط العامة.","Profiles start private. Only explicitly selected library images are published. Switching to private blocks the public profile and image links.","Le profil est privé par défaut. Seules les images choisies sont publiées. Le passage en privé bloque tous les liens publics.")}</p>
    <button type="submit" disabled={busy}>{busy?t("جارٍ الحفظ...","Saving...","Enregistrement..."):t("حفظ الملف والخصوصية","Save profile and visibility","Enregistrer le profil")}</button>
   </form>
   {publicUrl&&<p className="creatorPublicLink"><a href={publicUrl} target="_blank" rel="noopener noreferrer">{t("عرض ملفي العام","Open my public profile","Voir mon profil public")}</a></p>}
   <CreatorSocialLinksEditor ready={Boolean(saved)}/>
   {saved?.visibility==="public"&&<CreatorQr handle={saved.handle}/>}
   {saved&&<section className="creatorPortfolio">
    <h2>{t("معرض أعمالي","My portfolio","Mon portfolio")}</h2>
    <p>{t("اختر صورًا من مكتبتك لإظهارها في ملفك العام، بحد أقصى 24 صورة.","Select up to 24 images from your library for your public profile.","Choisissez jusqu’à 24 images de votre bibliothèque.")}</p>
    <label>{t("الصورة","Image","Image")}<select value={selected} onChange={e=>setSelected(e.target.value)} disabled={busy||portfolio.length>=24}><option value="">{t("اختر صورة","Choose image","Choisir une image")}</option>{library.filter(i=>!portfolio.some(p=>p.media_id===i.id)).map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
    <label>{t("وصف اختياري","Optional caption","Légende facultative")}<input value={caption} maxLength={240} onChange={e=>setCaption(e.target.value)}/></label>
    <button type="button" disabled={busy||!selected||portfolio.length>=24} onClick={()=>void addImage()}>{t("إضافة إلى المعرض","Add to portfolio","Ajouter au portfolio")}</button>
    <div className="creatorPortfolioGrid">{portfolio.map(item=><article key={item.id}>
      <img src={"/api/account/library/"+item.media_id} alt={item.caption||item.file_name} width={180} height={180}/>
      <small>{item.caption||item.file_name}</small><button type="button" disabled={busy} onClick={()=>void remove(item.id)}>{t("إزالة من الملف","Remove from profile","Retirer du profil")}</button>
     </article>)}</div>
    <p><Link href="/account/library">{t("إدارة مكتبتي ورفع صور جديدة","Open my library to upload images","Ouvrir ma bibliothèque")}</Link></p>
   </section>}
   {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
  </>}
 </section>;
}
