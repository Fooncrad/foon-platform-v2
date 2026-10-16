"use client";
import {useUiText} from "@/lib/i18n/ui-language";
import {useCallback,useEffect,useState} from "react";
import Image from "next/image";
type Media={id:string;name:string;size:number};
type Policy={accountType:string;maxFiles:number;maxStorageMb:number;maxFileMb:number;enabled:boolean};
async function fetchLibrary():Promise<{files:Media[];policy:Policy}>{const r=await fetch("/api/account/library",{cache:"no-store"});if(!r.ok)throw Error();return r.json();}
export default function MediaLibrary(){
 const translateUi=useUiText();

 const [files,setFiles]=useState<Media[]>([]),[policy,setPolicy]=useState<Policy|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const load=useCallback(async()=>{const data=await fetchLibrary();setFiles(data.files);setPolicy(data.policy)},[]);
 useEffect(()=>{let mounted=true;fetchLibrary().then(data=>{if(mounted){setFiles(data.files);setPolicy(data.policy);}}).catch(()=>{if(mounted)setMessage("تعذر تحميل مكتبة الصور. تحقق من تهيئة قاعدة البيانات.");});return()=>{mounted=false;};},[]);
 async function upload(file?:File){if(!file)return;setBusy(true);setMessage("");try{const form=new FormData();form.set("file",file);const r=await fetch("/api/account/library",{method:"POST",body:form});const result=await r.json().catch(()=>({}));if(!r.ok)throw Error(result.code??"UPLOAD_FAILED");await load();setMessage("تم حفظ الصورة بمقاس مربع 800×800.");}catch(e){setMessage("تعذر حفظ الصورة: "+(e instanceof Error?e.message:translateUi("خطأ غير معروف")))}finally{setBusy(false)}}
 async function remove(id:string){if(!confirm("هل تريد حذف الصورة من مكتبتك؟"))return;setBusy(true);try{const r=await fetch("/api/account/library",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id})});if(!r.ok)throw Error();await load();setMessage("تم حذف الصورة.")}catch{setMessage("تعذر حذف الصورة.")}finally{setBusy(false)}}
 const used=files.reduce((n,f)=>n+f.size,0)/1048576;
 return <section className="foonMediaLibrary"><header><div><h2>{translateUi("مكتبة صوري")}</h2><p>{translateUi("ارفع صورك من الجوال أو الجهاز واحتفظ بها في حسابك. تُضبط تلقائيًا على مقاس مربع 4:4.")}</p></div><label className="foonMediaUpload">{translateUi("إضافة صور")}<input type="file" accept="image/png,image/jpeg,image/webp" capture={undefined} disabled={busy||!policy?.enabled} onChange={e=>{void upload(e.target.files?.[0]);e.target.value=""}}/></label></header>{policy&&<p>{translateUi("المساحة المستخدمة:")} {used.toFixed(1)}  {translateUi("من")} {policy.maxStorageMb}  {translateUi("ميجابايت · الصور:")} {files.length}  {translateUi("من")} {policy.maxFiles}  {translateUi("· الحد للصورة")} {policy.maxFileMb}  {translateUi("ميجابايت")}</p>}{message&&<p role="status">{message}</p>}<div className="foonMediaGrid">{files.map(f=><article key={f.id}><Image src={"/api/account/library/"+f.id} alt={f.name} width={800} height={800} unoptimized/><strong title={f.name}>{f.name}</strong><button disabled={busy} onClick={()=>void remove(f.id)}>{translateUi("حذف الصورة")}</button></article>)}{!files.length&&<p>{translateUi("مكتبتك فارغة. أضف أول صورة من زر إضافة صور.")}</p>}</div></section>
}
