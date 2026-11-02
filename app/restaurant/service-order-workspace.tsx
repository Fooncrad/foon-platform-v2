"use client";
import {useEffect,useState,type FormEvent} from "react";
import {usePathname} from "next/navigation";
import {activityFromRouteSlug,activitySectionUrl} from "@/lib/tenant/workspace-routes";
import type {StoredResource} from "@/lib/restaurant/operations";
import {serviceOrderArchiveAllowed,serviceOrderTransitionAllowed} from "@/lib/restaurant/service-order-policy";
import {operationApi} from "./resource-manager";
import "./service-order-workspace.css";

type Language="ar"|"en"|"fr";
const statuses=["new","scheduled","in_progress","completed","cancelled"];
const labels:Record<string,[string,string,string]>={
 title:["أوامر الخدمة","Service orders","Ordres de service"],
 help:["إدارة التنفيذ والمواعيد ومتابعة حالة الخدمات.","Manage execution, appointments and service status.","Gérez l’exécution, les rendez-vous et l’état des services."],
 new:["جديد","New","Nouveau"],scheduled:["مجدول","Scheduled","Planifié"],in_progress:["قيد التنفيذ","In progress","En cours"],completed:["مكتمل","Completed","Terminé"],cancelled:["ملغى","Cancelled","Annulé"],
 add:["إنشاء أمر خدمة","Create service order","Créer un ordre de service"],edit:["تعديل","Edit","Modifier"],details:["عرض التفاصيل","View details","Voir les détails"],save:["حفظ","Save","Enregistrer"],close:["إغلاق","Close","Fermer"],
 name:["عنوان الخدمة","Service title","Titre du service"],customer:["اسم العميل","Customer name","Nom du client"],phone:["جوال العميل","Customer phone","Téléphone du client"],description:["تفاصيل الخدمة","Service details","Détails du service"],amount:["قيمة الخدمة","Service amount","Montant du service"],date:["موعد التنفيذ","Scheduled time","Date prévue"],notes:["ملاحظات","Notes","Notes"],branch:["الفرع","Branch","Succursale"],allBranches:["النشاط بالكامل","All branches","Toutes les succursales"],status:["الحالة","Status","État"],search:["بحث في أوامر الخدمة","Search service orders","Rechercher les ordres de service"],all:["كل الحالات","All statuses","Tous les états"],refresh:["تحديث","Refresh","Actualiser"],loading:["جارٍ التحميل…","Loading…","Chargement…"],empty:["لا توجد أوامر خدمة مطابقة.","No matching service orders.","Aucun ordre de service correspondant."],busy:["جارٍ الحفظ…","Saving…","Enregistrement…"],saved:["تم حفظ أمر الخدمة.","Service order saved.","Ordre de service enregistré."],updated:["تم تحديث الحالة.","Status updated.","État mis à jour."],archived:["تمت أرشفة أمر الخدمة.","Service order archived.","Ordre de service archivé."],archive:["أرشفة","Archive","Archiver"],confirmArchive:["هل تريد أرشفة أمر الخدمة الجديد؟","Archive this new service order?","Archiver ce nouvel ordre de service ?"],confirmCancel:["هل تريد إلغاء أمر الخدمة؟","Cancel this service order?","Annuler cet ordre de service ?"],
 final:["السجل نهائي ومحفوظ للرجوع إليه. لا يمكن تعديله أو إعادة فتحه.","This final record is retained for reference. It cannot be changed or reopened.","Cet enregistrement final est conservé. Il ne peut être modifié ni rouvert."],quote:["مرتبط بعرض سعر معتمد؛ بيانات العرض محفوظة.","Linked to an accepted quotation; quotation details are preserved.","Lié à un devis accepté ; ses données sont conservées."],
 invoiceDraft:["إنشاء مسودة فاتورة","Create invoice draft","Créer un brouillon de facture"],invoiceCreated:["تم إنشاء مسودة الفاتورة؛ لم تُسدّد بعد.","Invoice draft created; payment is not recorded.","Brouillon de facture créé ; paiement non enregistré."],invoiceExisting:["توجد فاتورة مرتبطة بهذه الخدمة مسبقًا.","This service already has an invoice.","Cette prestation possède déjà une facture."],invoiceLink:["فتح الفواتير","Open invoices","Ouvrir les factures"],
 invalid:["تحقق من المبلغ وموعد التنفيذ.","Check the amount and scheduled time.","Vérifiez le montant et la date prévue."],failed:["تعذر إتمام العملية.","The operation could not be completed.","L’opération n’a pas pu aboutir."],
};
function localDate(value:unknown){
 if(!value)return "";
 const date=new Date(String(value));
 return Number.isFinite(date.getTime())?new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16):"";
}
export default function ServiceOrderWorkspace({tenantId,branch,branches,onChanged,grants,fullAccess=true,language="ar",currency="SAR"}:{tenantId:string;branch:string;branches:{id:string;name:string}[];onChanged:()=>void;grants?:string[];fullAccess?:boolean;language?:Language;currency?:string}){
 const merchantPath=usePathname();
 const merchantActivity=activityFromRouteSlug(merchantPath.split("/")[1]??"");
 const index=language==="ar"?0:language==="en"?1:2,t=(key:string)=>labels[key]?.[index]??key;
 const can=(action:string)=>fullAccess||Boolean(grants?.includes("serviceOrders."+action)||grants?.includes("serviceOrders.manage"));
 const [rows,setRows]=useState<StoredResource[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[search,setSearch]=useState(""),[status,setStatus]=useState("");
 const [formOpen,setFormOpen]=useState(false),[editing,setEditing]=useState<StoredResource|null>(null);
 const final=Boolean(editing&&["completed","cancelled"].includes(editing.status));
 const readOnly=final||!can(editing?"edit":"create"),sourceLocked=Boolean(editing?.data.quotationId);
 const errorText=(error:unknown)=>error instanceof Error?error.message:t("failed");
 async function refresh(){const result=await operationApi(tenantId,"serviceOrders","GET",undefined,branch);if(!Array.isArray(result.resources))throw new Error(t("failed"));setRows(result.resources);}
 useEffect(()=>{let alive=true;operationApi(tenantId,"serviceOrders","GET",undefined,branch).then(result=>{if(!Array.isArray(result.resources))throw new Error("INVALID_SERVICE_ORDER_RESPONSE");if(alive){setRows(result.resources);setLoading(false);}}).catch(error=>{if(alive){setMessage(error instanceof Error?error.message:"LOAD_FAILED");setLoading(false);}});return()=>{alive=false;};},[tenantId,branch]);
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy||readOnly)return;
  const data=new FormData(event.currentTarget),amount=Number(data.get("amount")),scheduled=String(data.get("scheduledAt")??"");
  if(!Number.isFinite(amount)||amount<0||amount>100000000||scheduled&&!Number.isFinite(new Date(scheduled).getTime())){setMessage(t("invalid"));return;}
  setBusy(true);setMessage("");
  try{
   await operationApi(tenantId,"serviceOrders",editing?"PATCH":"POST",{...(editing?{id:editing.id,version:Number(editing.version)}:{}),name:String(data.get("name")??"").trim(),status:String(data.get("status")),branchId:sourceLocked?editing!.branch_id:String(data.get("branchId")??"")||null,data:{...(editing?.data??{}),customerName:String(data.get("customerName")??"").trim(),customerPhone:String(data.get("customerPhone")??"").trim(),serviceDescription:String(data.get("serviceDescription")??"").trim(),amount,scheduledAt:scheduled?new Date(scheduled).toISOString():null,notes:String(data.get("notes")??"").trim()}});
   setFormOpen(false);setEditing(null);await refresh();onChanged();setMessage(t("saved"));
  }catch(error){setMessage(errorText(error));}finally{setBusy(false);}
 }
 async function changeStatus(row:StoredResource,next:string){
  if(busy||!can("edit")||!serviceOrderTransitionAllowed(row.status,next))return;
  if(next==="cancelled"&&!window.confirm(t("confirmCancel")))return;
  setBusy(true);setMessage("");
  try{await operationApi(tenantId,"serviceOrders","PATCH",{id:row.id,version:Number(row.version),name:row.name,status:next,branchId:row.branch_id,data:row.data});setFormOpen(false);setEditing(null);await refresh();onChanged();setMessage(t("updated"));}catch(error){setMessage(errorText(error));}finally{setBusy(false);}
 }
 async function draftInvoice(row:StoredResource){
  if(busy||row.status!=="completed"||!can("edit"))return;
  setBusy(true);setMessage("");
  try{
   const target=row.branch_id??branch;
   const result=await operationApi(tenantId,"customerInvoices","POST",{invoiceFromServiceOrderId:row.id,...(target?{branchId:target}:{})});
   if(!result?.id)throw new Error("INVALID_INVOICE_RESPONSE");
   setMessage(t(result.existing?"invoiceExisting":"invoiceCreated"));await refresh();onChanged();
  }catch(error){setMessage(errorText(error));}finally{setBusy(false);}
 }
 async function archive(row:StoredResource){
  if(busy||!can("delete")||!serviceOrderArchiveAllowed(row.status)||!window.confirm(t("confirmArchive")))return;
  setBusy(true);setMessage("");try{await operationApi(tenantId,"serviceOrders","DELETE",{id:row.id,version:Number(row.version)});setFormOpen(false);setEditing(null);await refresh();onChanged();setMessage(t("archived"));}catch(error){setMessage(errorText(error));}finally{setBusy(false);}
 }
 const filtered=rows.filter(row=>(!status||row.status===status)&&(row.name+" "+row.data.customerName+" "+(row.data.customerPhone??"")+" "+row.data.serviceDescription).toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()));
 const statusesForForm=statuses.filter(next=>serviceOrderTransitionAllowed(editing?.status??null,next));
 return <section className="restaurantPanel foonServiceOrders" dir={language==="ar"?"rtl":"ltr"} aria-label={t("title")}>
  <header><div><h3>{t("title")}</h3><p>{t("help")}</p></div>{can("create")&&<button type="button" className="restaurantPrimary" disabled={busy} onClick={()=>{setEditing(null);setFormOpen(true);setMessage("");}}>{t("add")}</button>}</header>
  {message&&<p role="status" className="restaurantNotice">{message}</p>}{message&&<a href={merchantActivity?activitySectionUrl(merchantActivity,"printers"):"/account"}>{t("invoiceLink")}</a>}
  {formOpen&&<form key={editing?.id??"new"} className="foonServiceOrderForm" onSubmit={save} aria-label={editing?t(readOnly?"details":"edit"):t("add")}>
   <h4>{editing?t(readOnly?"details":"edit"):t("add")}</h4>{final&&<p>{t("final")}</p>}{sourceLocked&&<p>{t("quote")}</p>}
   <fieldset disabled={busy||readOnly}>
    <label>{t("name")}<input name="name" required maxLength={180} defaultValue={editing?.name??""}/></label>
    <label>{t("customer")}<input name="customerName" required maxLength={180} readOnly={sourceLocked} defaultValue={String(editing?.data.customerName??"")}/></label>
    <label>{t("phone")}<input name="customerPhone" type="tel" dir="ltr" lang="en" maxLength={40} onInput={event=>{event.currentTarget.value=event.currentTarget.value.replace(/[٠-٩۰-۹]/g,digit=>String(digit.charCodeAt(0)-(digit<="٩"?0x660:0x6f0)));}} defaultValue={String(editing?.data.customerPhone??"")}/></label>
    <label>{t("amount")} ({currency})<input name="amount" type="number" dir="ltr" lang="en" required min={0} max={100000000} step="0.01" readOnly={sourceLocked} defaultValue={Number(editing?.data.amount??0)}/></label>
    <label>{t("date")}<input name="scheduledAt" type="datetime-local" dir="ltr" lang="en" defaultValue={localDate(editing?.data.scheduledAt)}/></label>
    <label>{t("status")}<select name="status" defaultValue={editing?.status??"new"}>{statusesForForm.map(value=><option key={value} value={value}>{t(value)}</option>)}</select></label>
    <label>{t("branch")}<select name="branchId" disabled={sourceLocked} defaultValue={editing?.branch_id??(branch||(!fullAccess?branches[0]?.id??"":""))}>{fullAccess&&<option value="">{t("allBranches")}</option>}{branches.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className="foonServiceOrderWide">{t("description")}<textarea name="serviceDescription" required maxLength={5000} readOnly={sourceLocked} defaultValue={String(editing?.data.serviceDescription??"")}/></label>
    <label className="foonServiceOrderWide">{t("notes")}<textarea name="notes" maxLength={5000} defaultValue={String(editing?.data.notes??"")}/></label>
   </fieldset>
   <div className="foonServiceOrderActions">{!readOnly&&<button className="restaurantPrimary" disabled={busy}>{busy?t("busy"):t("save")}</button>}<button type="button" className="restaurantOutline" disabled={busy} onClick={()=>{setFormOpen(false);setEditing(null);}}>{t("close")}</button></div>
  </form>}
  <div className="foonServiceOrderFilters"><label>{t("search")}<input type="search" value={search} onChange={event=>setSearch(event.target.value)}/></label><label>{t("status")}<select value={status} onChange={event=>setStatus(event.target.value)}><option value="">{t("all")}</option>{statuses.map(value=><option key={value} value={value}>{t(value)}</option>)}</select></label><button type="button" className="restaurantOutline" disabled={busy||loading} onClick={()=>{setMessage("");void refresh().catch(error=>setMessage(errorText(error)));}}>{t("refresh")}</button></div>
  {loading?<p role="status">{t("loading")}</p>:!filtered.length?<p>{t("empty")}</p>:<div className="foonServiceOrderList">{filtered.map(row=>{
   const terminal=["completed","cancelled"].includes(row.status),scheduled=row.data.scheduledAt?new Date(String(row.data.scheduledAt)):null;
   return <article key={row.id} data-status={row.status}><header><h4>{row.name}</h4><span className="restaurantStateBadge" data-status={row.status}>{t(row.status)}</span></header><p>{String(row.data.customerName??"")}</p><p>{String(row.data.serviceDescription??"")}</p><strong dir="ltr">{Number(row.data.amount??0).toLocaleString(language,{minimumFractionDigits:2,maximumFractionDigits:2,numberingSystem:"latn"})} {currency}</strong>{scheduled&&Number.isFinite(scheduled.getTime())&&<p><time dateTime={scheduled.toISOString()}>{scheduled.toLocaleString(language,{numberingSystem:"latn"})}</time></p>}<small>{branches.find(item=>item.id===row.branch_id)?.name??t("allBranches")}</small>{terminal&&<p className="restaurantFinePrint">{t("final")}</p>}<div className="foonServiceOrderActions"><button type="button" disabled={busy} onClick={()=>{setEditing(row);setFormOpen(true);setMessage("");}}>{t(terminal||!can("edit")?"details":"edit")}</button>{!terminal&&can("edit")&&statuses.filter(next=>next!==row.status&&serviceOrderTransitionAllowed(row.status,next)).map(next=><button key={next} type="button" disabled={busy} onClick={()=>void changeStatus(row,next)}>{t(next)}</button>)}{row.status==="completed"&&can("edit")&&<button type="button" disabled={busy} onClick={()=>void draftInvoice(row)}>{t("invoiceDraft")}</button>}{can("delete")&&!row.data.quotationId&&serviceOrderArchiveAllowed(row.status)&&<button type="button" disabled={busy} onClick={()=>void archive(row)}>{t("archive")}</button>}</div></article>;
  })}</div>}
 </section>;
}
