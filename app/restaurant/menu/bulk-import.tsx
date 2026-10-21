'use client';
import {useState} from 'react';
import {useUiLanguage} from '@/lib/i18n/ui-language';
import {importHeaders,parseImportCsv,type ImportKind,type ImportRow} from '@/lib/catalog/import-csv';
import {formatImportError} from '@/lib/catalog/import-errors';
export default function BulkImport({tenantId,kind,onChanged,canonical=false,categoryHint='',productHint='',groupHint='',optionsHint=''}:{tenantId:string;kind:ImportKind;onChanged?:()=>void;canonical?:boolean;categoryHint?:string;productHint?:string;groupHint?:string;optionsHint?:string}){
 const language=useUiLanguage(),t=(ar:string,en:string,fr:string)=>language==='ar'?ar:language==='en'?en:fr;
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[progress,setProgress]=useState({done:0,total:0});
 const [availableCategories,setAvailableCategories]=useState<string[]>([]),[selectedCategory,setSelectedCategory]=useState(''),[loadingCategories,setLoadingCategories]=useState(false);
 async function refreshCategories(){
  if(kind==='categories')return;
  const endpoint=canonical?'/api/restaurant/menu/categories':'/api/restaurant/activity-catalog?page=1';
  setLoadingCategories(true);
  try{
   const response=await fetch(endpoint,{headers:{'x-foon-tenant':tenantId},cache:'no-store'});
   if(!response.ok)throw Error('CATEGORY_LIST_UNAVAILABLE');
   const data=await response.json();
   if(!Array.isArray(data.categories))throw Error('CATEGORY_LIST_UNAVAILABLE');
   const names=[...new Set((data.categories as {name?:unknown;name_ar?:unknown;enabled?:unknown}[])
    .filter(category=>Boolean(category.enabled))
    .map(category=>String(category.name_ar??category.name??'').trim()).filter(Boolean))];
   setAvailableCategories(names);
   setSelectedCategory(previous=>names.includes(previous)?previous:categoryHint&&names.includes(categoryHint)?categoryHint:names.length===1?names[0]:'');
  }catch{setMessage(t('تعذر تحميل الأقسام الحالية. يمكنك استخدام عمود category في الملف وإعادة المحاولة.','Could not load categories. You can still enter category names in the CSV and retry.','Impossible de charger les catégories. Renseignez category dans le CSV.'));}finally{setLoadingCategories(false);}
 }
 const labels={categories:t('الأقسام','Categories','Catégories'),items:t('الأصناف والمنتجات','Items and products','Articles et produits'),groups:t('مجموعات الخيارات','Option groups','Groupes d’options'),values:t('الإضافات وقيم المتغيرات','Add-ons and option values','Suppléments et valeurs'),variants:t('تركيبات المتغيرات ومخزونها','Variant combinations and stock','Combinaisons et stocks')};
 const storage='foon-import-'+tenantId+'-'+kind;
 type Job={id:string;rows:ImportRow[];next:number};
 const [preview,setPreview]=useState<Job|null>(null);
 async function run(job:Job){setBusy(true);setMessage('');setProgress({done:job.next,total:job.rows.length});try{
  while(job.next<job.rows.length){const index=job.next;localStorage.setItem(storage,JSON.stringify(job));
   const response=await fetch('/api/restaurant/catalog-import',{method:'POST',headers:{'content-type':'application/json','x-foon-tenant':tenantId},body:JSON.stringify({kind,requestKey:job.id+'-'+index,rows:job.rows.slice(index,index+5)})});const result=await response.json();if(!response.ok)throw Error(t('الصفوف','Rows','Lignes')+' '+(index+2)+'–'+Math.min(index+6,job.rows.length+1)+': '+formatImportError(String(result.code??'IMPORT_FAILED'),language,index));
   job.next=Math.min(index+5,job.rows.length);localStorage.setItem(storage,JSON.stringify(job));setProgress({done:job.next,total:job.rows.length});
  }localStorage.removeItem(storage);setMessage(t('اكتمل الاستيراد.','Import completed.','Import terminé.'));onChanged?.();if(canonical)window.dispatchEvent(new CustomEvent('foon:catalog-imported',{detail:{tenantId,kind}}));
 }catch(e){setMessage(t('توقف الاستيراد. السجلات المكتملة محفوظة؛ استأنف لإعادة الدفعة المتوقفة دون تكرار.','Import paused. Completed records are saved; resume to retry without duplicates.','Import suspendu. Les lignes terminées sont conservées ; reprenez sans doublons.')+' '+(e instanceof Error?e.message:''));}finally{setBusy(false);}}
 const examples:Record<ImportKind,Record<string,string>>={categories:{name:'قسم تجريبي',name_en:'Sample category',name_fr:'Catégorie exemple'},items:{category:'قسم تجريبي',name:'منتج تجريبي',price:'12.50',unit:'piece'},groups:{category:'قسم تجريبي',product:'منتج تجريبي',name:'اللون',selection:'single',required:'yes',max:'1'},values:{category:'قسم تجريبي',product:'منتج تجريبي',group:'اللون',name:'أحمر',price:'0',stock:'10'},variants:{category:'قسم تجريبي',product:'منتج تجريبي',options:'اللون=أحمر',sku:'RED-001',stock:'10'}};
 const headers=importHeaders[kind].filter(k=>!canonical||!(kind==="items"?["sku","unit","quantity_mode","weight_kg","length_cm","width_cm","height_cm"]:kind==="values"?["stock"]:[]).includes(k));
 const quoteCsv=(value:string)=>/[",\r\n]/.test(value)?'"'+value.replace(/"/g,'""')+'"':value;
 const example=[headers.join(','),headers.map(k=>quoteCsv(k==='category'?selectedCategory:k==='product'?productHint:k==='group'?groupHint:k==='options'?optionsHint:examples[kind][k]??'')).join(',')].join('\r\n');
 function downloadTemplate(){
  const blob=new Blob(['\uFEFF',example],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download='foon-'+kind+'-template.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),10000);
 }
 return <details className="foonBulkImport" onToggle={event=>{if(event.currentTarget.open)void refreshCategories()}}><summary><strong>{t('استيراد','Import','Importer')} {labels[kind]}</strong><span className="foonBulkImportBadge">CSV</span></summary><div className="foonBulkImportBody"><ol className="foonBulkImportSteps"><li>{t('ابدأ بتنزيل قالب CSV المناسب للقسم.','Download the matching CSV template.','Téléchargez le modèle CSV correspondant.')}</li><li>{t('املأ الملف باستخدام الأسماء العربية المطابقة؛ الترتيب: الأقسام ← الأصناف ← مجموعات الخيارات ← القيم ← التركيبات.','Fill the file using matching Arabic references. Import in order: categories → items → option groups → values → variants.','Renseignez le modèle avec les références arabes exactes. Importez dans l’ordre : catégories → articles → groupes → valeurs → variantes.')}</li><li>{t('اختر الملف لبدء الاستيراد؛ الحد 500 صف، مع حفظ التقدم وإمكانية الاستئناف.','Choose the file to start. Up to 500 rows; progress is saved and can resume.','Choisissez le fichier pour démarrer. 500 lignes maximum ; reprise possible.')}</li></ol><p>{t('روابط الصور HTTPS اختيارية. تُحفظ الصور داخل مكتبة صاحب النشاط وتُقص تلقائيًا إلى مربع 4:4 (800×800). المساحة تخضع لحدود الأدمن. يجب أن تطابق مراجع الأقسام والأصناف والمجموعات أسماءها العربية تمامًا.','Optional HTTPS image links are stored in the owner’s library and cropped to 4:4 (800×800), subject to admin quotas. References must match Arabic names exactly.','Les liens HTTPS facultatifs sont conservés dans la bibliothèque du propriétaire et recadrés en 4:4 (800×800), selon les quotas. Les références doivent correspondre aux noms arabes.')}</p>{kind!=='categories'&&<label className="foonBulkImportCategory">{t('القسم الافتراضي للصفوف الناقصة','Default category for rows missing a category','Catégorie par défaut si absente')}<select value={selectedCategory} disabled={loadingCategories} onChange={event=>setSelectedCategory(event.target.value)} aria-label={t('اختيار قسم موجود','Choose an existing category','Choisir une catégorie existante')}><option value="">{t('بدون قسم افتراضي (استخدم عمود category)','No default (use category column)','Aucune catégorie par défaut (colonne category)')}</option>{availableCategories.map(name=><option key={name} value={name}>{name}</option>)}</select><small>{availableCategories.length===0?t('لا توجد أقسام متاحة؛ استورد الأقسام أولًا ثم افتح الاستيراد مجددًا.','No categories available; import categories first, then reopen the importer.','Aucune catégorie ; importez d’abord les catégories.'):t('لا يُستبدل اسم القسم الموجود في الملف؛ يُستكمل فقط الحقل الفارغ.','Existing category values in the file are never replaced; only blanks are filled.','Les catégories existantes dans le fichier restent inchangées.')}</small></label>}{kind==='variants'&&<p dir='ltr'>options: اللون=أحمر|المقاس=كبير</p>}<button type='button' onClick={downloadTemplate} disabled={loadingCategories} className="foonBulkImportTemplate">↓ {t('تنزيل قالب CSV جاهز','Download CSV template','Télécharger le modèle CSV')}</button><label className="foonBulkImportFile">{t('اختيار ملف وبدء الاستيراد','Choose file and start import','Choisir un fichier et importer')}<input type='file' accept='.csv,text/csv' disabled={busy||loadingCategories} onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>1000000)throw Error('CSV_TOO_LARGE');if(localStorage.getItem(storage))throw Error(t('يوجد استيراد متوقف. استأنفه أولًا قبل اختيار ملف جديد.','A paused import exists. Resume it before starting another file.','Un import suspendu existe. Reprenez-le avant de choisir un autre fichier.'));const rows=parseImportCsv(await file.text(),kind,{defaultCategory:selectedCategory});setPreview({id:crypto.randomUUID(),rows,next:0});setMessage(t('راجع عينة الصفوف ثم أكّد الاستيراد. لم تُحفظ أي بيانات بعد.','Review the row sample and confirm. No data has been saved yet.','Vérifiez les lignes et confirmez. Aucune donnée n’a encore été enregistrée.'));}catch(error){const code=error instanceof Error?error.message:'INVALID_CSV';setMessage(/^(ROW_\d+:|[A-Z_]+$)/.test(code)?formatImportError(code,language):code);}}}/></label>{preview&&<section className="foonBulkImportPreview" aria-label={t('معاينة CSV قبل الاستيراد','CSV preview before import','Aperçu CSV avant import')}>
 <h3>{t('معاينة الملف','File preview','Aperçu du fichier')}</h3>
 <p>{t('عدد الصفوف: ','Rows: ','Lignes : ')}<strong>{preview.rows.length}</strong> · {t('أول 5 صفوف','First 5 rows','5 premières lignes')}</p>
 <ol>{preview.rows.slice(0,5).map((row,index)=><li key={index} dir="auto"><strong>{row.name||row.product||row.options||t('بدون اسم','Unnamed','Sans nom')}</strong>{row.category&&<span> · {row.category}</span>}{row.price&&<span> · {row.price}</span>}{row.sku&&<span> · {row.sku}</span>}</li>)}</ol>
 <p>{t('تأكد من صحة الملفات والأسماء والأسعار والصور قبل الحفظ.','Check names, prices, options, and image links before saving.','Vérifiez les noms, prix, options et images avant d’enregistrer.')}</p>
 <div className="foonBulkImportPreviewActions">
  <button type="button" disabled={busy} onClick={()=>{const job=preview;setPreview(null);void run(job);}}>{t('تأكيد واستيراد','Confirm and import','Confirmer et importer')} ({preview.rows.length})</button>
  <button type="button" disabled={busy} onClick={()=>{setPreview(null);setMessage('');}}>{t('إلغاء دون حفظ','Cancel without saving','Annuler sans enregistrer')}</button>
 </div>
 </section>}<button type='button' disabled={busy} onClick={()=>{try{const job=JSON.parse(localStorage.getItem(storage)??'null');if(!job||!Array.isArray(job.rows)||!Number.isInteger(job.next)||typeof job.id!=='string')throw Error();void run(job);}catch{setMessage(t('لا يوجد استيراد متوقف لهذا القسم.','No paused import in this section.','Aucun import suspendu dans cette section.'));}}}>{t('استئناف آخر استيراد','Resume last import','Reprendre le dernier import')}</button>{progress.total>0&&<div role='status' aria-live='polite'><progress max={progress.total} value={progress.done} style={{width:'100%',marginTop:12}}/>{progress.done} / {progress.total} {busy&&t('جارٍ معالجة السجلات والصور…','Processing records and images…','Traitement des lignes et images…')}</div>}{message&&<p role='status' style={{overflowWrap:'anywhere'}} >{message}</p>}</div></details>;
}
