"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {containsArabic,normalizeTranslationSource,translationLeakKey} from "@/lib/i18n/translation-leaks";
type Translation={translation_key:string;text_ar:string;text_en:string;text_fr:string};
const supportedSelector="button,a,label,th,h1,h2,h3,h4,h5,h6,legend,summary,p,li,dt,dd";
const ignoredSelector='[data-translation-ignore],[data-translation-diagnostics],input,textarea,select,option,script,style,code,pre,table,[contenteditable="true"]';

export default function TranslationLeakMonitor(){
 const [language,setLanguage]=useState<"ar"|"en"|"fr">("ar"),[translations,setTranslations]=useState<Translation[]>([]),[leaks,setLeaks]=useState<Translation[]>([]),[expanded,setExpanded]=useState(false),[canEdit,setCanEdit]=useState(false),[drafts,setDrafts]=useState<Record<string,{text_en:string;text_fr:string}>>({}),[busy,setBusy]=useState(""),[message,setMessage]=useState("");
 const originalText=useRef(new Map<Node,string>());
 useEffect(()=>{const update=()=>setLanguage(document.documentElement.lang==="fr"?"fr":document.documentElement.lang==="en"?"en":"ar");update();const observer=new MutationObserver(update);observer.observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});window.addEventListener("foon:language-change",update);return()=>{observer.disconnect();window.removeEventListener("foon:language-change",update);};},[]);
 useEffect(()=>{let live=true;(async()=>{const items:Translation[]=[];for(let page=1;page<=20;page++){const response=await fetch(`/api/admin/translations?leaks=1&page=${page}`);if(!response.ok)break;const body=await response.json();if(live&&page===1)setCanEdit(body.canEdit===true);const batch=(body.rows??[]).filter((row:Translation)=>row.translation_key.startsWith("ui.leak."));items.push(...batch);if(batch.length<50)break;}if(live)setTranslations(items);})().catch(()=>{});return()=>{live=false;};},[]);
 const scan=useCallback(()=>{
  if(language==="ar"){for(const [node,source] of originalText.current)if(node.isConnected)node.nodeValue=source;originalText.current.clear();setLeaks([]);return;}
  const bySource=new Map(translations.map(row=>[normalizeTranslationSource(row.text_ar),row]));const found=new Map<string,Translation>();
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node:Node|null;
  while((node=walker.nextNode())){
   const parent=node.parentElement;if(!parent||parent.closest(ignoredSelector)||!parent.closest(supportedSelector))continue;
   const raw=originalText.current.get(node)??node.nodeValue??"",source=normalizeTranslationSource(raw);if(!source||!containsArabic(source))continue;
   const saved=bySource.get(source),translated=saved?.[language==="en"?"text_en":"text_fr"]?.trim();
   if(translated){originalText.current.set(node,raw);node.nodeValue=raw.replace(source,translated);continue;}
   if(originalText.current.has(node)){node.nodeValue=raw;originalText.current.delete(node);}
   const key=translationLeakKey(source);found.set(key,{translation_key:key,text_ar:source,text_en:saved?.text_en??"",text_fr:saved?.text_fr??""});
  }
  for(const node of originalText.current.keys())if(!node.isConnected)originalText.current.delete(node);
  const next=[...found.values()];setLeaks(previous=>previous.length===next.length&&previous.every((item,index)=>item.translation_key===next[index]?.translation_key&&item.text_en===next[index]?.text_en&&item.text_fr===next[index]?.text_fr)?previous:next);
 },[language,translations]);
 useEffect(()=>{if(language==="ar")return;const translatedNodes=originalText.current;const initial=window.setTimeout(scan,0);const observer=new MutationObserver(()=>scan());observer.observe(document.body,{subtree:true,childList:true,characterData:true});const timer=window.setInterval(scan,2500);return()=>{window.clearTimeout(initial);observer.disconnect();window.clearInterval(timer);for(const [node,source] of translatedNodes)if(node.isConnected)node.nodeValue=source;translatedNodes.clear();};},[language,scan]);
 async function save(row:Translation){setBusy(row.translation_key);setMessage("");const draft=drafts[row.translation_key]??{text_en:row.text_en,text_fr:row.text_fr};try{const response=await fetch("/api/admin/translations",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({...row,...draft})});if(!response.ok)throw new Error("TRANSLATION_SAVE_FAILED");const updated={...row,...draft};setTranslations(items=>[...items.filter(item=>item.translation_key!==row.translation_key),updated]);setMessage(language==="fr"?"Traduction enregistrée.":"Translation saved.");}catch{setMessage(language==="fr"?"Impossible d’enregistrer la traduction.":"Could not save the translation.");}finally{setBusy("");}}
 if(language==="ar"||(!leaks.length&&!expanded))return null;
 const label=language==="fr"?"Texte arabe à traduire":"Arabic text to translate";
 return <aside className="translationLeakAlert" data-translation-diagnostics aria-label={language==="fr"?"Vérification des traductions":"Translation check"}>
  <div className="translationLeakTop"><div><strong>{leaks.length?`${leaks.length} ${language==="fr"?"texte(s) arabe(s) à traduire":"Arabic text item(s) need translation"}`:(language==="fr"?"Aucune fuite de traduction détectée":"No untranslated Arabic text detected")}</strong><small>{language==="fr"?"Traduisez manuellement ici. Aucun fournisseur externe n’est utilisé.":"Enter translations here. No external translation provider is used."}</small></div><button type="button" onClick={()=>setExpanded(value=>!value)} aria-expanded={expanded}>{expanded?(language==="fr"?"Réduire":"Hide"): (language==="fr"?"Gérer":"Translate")}</button></div>
  {expanded&&leaks.length>0&&<div className="translationLeakList">{leaks.map(row=>{const draft=drafts[row.translation_key]??{text_en:row.text_en,text_fr:row.text_fr};return <article className="translationLeakRow" key={row.translation_key}><div><small>{label}</small><p dir="rtl">{row.text_ar}</p></div><label>English<textarea readOnly={!canEdit} value={draft.text_en} onChange={event=>setDrafts(old=>({...old,[row.translation_key]:{...draft,text_en:event.target.value}}))}/></label><label>Français<textarea readOnly={!canEdit} value={draft.text_fr} onChange={event=>setDrafts(old=>({...old,[row.translation_key]:{...draft,text_fr:event.target.value}}))}/></label>{canEdit&&<button type="button" disabled={busy===row.translation_key||!draft.text_en.trim()||!draft.text_fr.trim()} onClick={()=>void save(row)}>{busy===row.translation_key?(language==="fr"?"Enregistrement…":"Saving…"):(language==="fr"?"Enregistrer":"Save")}</button>}</article>;})}</div>}
  {message&&<p role="status">{message}</p>}
 </aside>;
}
