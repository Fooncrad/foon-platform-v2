export const importKinds=['categories','items','groups','values','variants'] as const;
export type ImportKind=typeof importKinds[number];
export type ImportRow=Record<string,string>;
export const importHeaders:Record<ImportKind,string[]>={categories:['name','name_en','name_fr','description','description_en','description_fr','image_1'],items:['category','name','name_en','name_fr','price','description','description_en','description_fr','sku','stock','unit','quantity_mode','weight_kg','length_cm','width_cm','height_cm','image_1','image_2','image_3','image_4'],groups:['category','product','name','name_en','name_fr','selection','required','max'],values:['category','product','group','name','name_en','name_fr','price','stock','image_1'],variants:['category','product','options','sku','stock','image_1','image_2','image_3','image_4']};
export function validateImportRow(kind:ImportKind,row:unknown):asserts row is ImportRow{
 if(!row||typeof row!=='object'||Array.isArray(row))throw Error('INVALID_ROW');
 const r=row as ImportRow;for(const [k,v] of Object.entries(r))if(!importHeaders[kind].includes(k)||typeof v!=='string'||v.length>(k.startsWith('description')?5000:1024))throw Error('INVALID_COLUMN_'+k);
 for(const k of kind==='categories'?['name']:kind==='items'?['category','name','price']:kind==='groups'?['category','product','name']:kind==='values'?['category','product','group','name']:['category','product','options'])if(!r[k]?.trim())throw Error('REQUIRED_'+k);
 for(const k of ['name','name_en','name_fr','category','product','group'])if((r[k]?.length??0)>180)throw Error('INVALID_'+k);
 for(const k of ['price','stock','weight_kg','length_cm','width_cm','height_cm'])if(r[k]&&(!/^\d{1,9}(\.\d{1,3})?$/.test(r[k])||!Number.isFinite(Number(r[k]))||Number(r[k])>999999999))throw Error('INVALID_'+k);
 if(r.price&&Math.abs(Number(r.price)*100-Math.round(Number(r.price)*100))>1e-7)throw Error('INVALID_PRICE_PRECISION');
 if(r.selection&&!['single','multiple'].includes(r.selection))throw Error('INVALID_SELECTION');
 if(r.required&&!['yes','no'].includes(r.required))throw Error('INVALID_REQUIRED');
 if(r.max&&(!/^\d+$/.test(r.max)||Number(r.max)<1||Number(r.max)>50))throw Error('INVALID_MAX');
 if((r.sku?.length??0)>100)throw Error('INVALID_SKU');
 for(const k of ['image_1','image_2','image_3','image_4'])if(r[k]){if(/^\/api\/account\/library\/[a-f0-9-]{36}$/i.test(r[k]))continue;const u=new URL(r[k]);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')throw Error('HTTPS_IMAGE_REQUIRED');}
}
// Reject duplicate identities across the full CSV before the first five-row
// transaction is submitted. This avoids partial imports with a later duplicate.
function csvIdentity(kind:ImportKind,row:ImportRow):string{
 const fields=kind==='categories'?['name']:
  kind==='items'?['category','name']:
  kind==='groups'?['category','product','name']:
  kind==='values'?['category','product','group','name']:
  ['category','product','options'];
 return JSON.stringify(fields.map(key=>{
  const value=String(row[key]??'').normalize('NFKC').trim();
  if(key==='options')return value.split('|').map(pair=>{
   const i=pair.indexOf('=');
   return i>=0?pair.slice(0,i).trim()+'='+pair.slice(i+1).trim():pair.trim();
  }).sort().join('|');
  return value.toLocaleLowerCase('en');
 }));
}
export function validateImportRows(kind:ImportKind,rows:ImportRow[]):void{
 const firstByIdentity=new Map<string,number>();
 for(let i=0;i<rows.length;i++){
  try{validateImportRow(kind,rows[i]);}catch(error){throw Error('ROW_'+(i+2)+': '+(error instanceof Error?error.message:'INVALID_ROW'));}
  const key=csvIdentity(kind,rows[i]);
  const previous=firstByIdentity.get(key);
  if(previous!==undefined)throw Error('ROW_'+(i+2)+': DUPLICATE_CSV_REFERENCE_ROW_'+(previous+2));
  firstByIdentity.set(key,i);
 }
}
export function parseImportCsv(input:string,kind:ImportKind):ImportRow[]{
 if(input.length>1000000)throw Error('CSV_TOO_LARGE');
 const text=input.replace(/^\uFEFF/,'');
 const lines:string[][]=[];
 let line:string[]=[],cell='',quoted=false,closedQuote=false;
 const endCell=()=>{line.push(cell.trim());cell='';closedQuote=false;};
 const endLine=()=>{endCell();if(line.some(Boolean))lines.push(line);line=[];if(lines.length>501)throw Error('CSV_ROW_LIMIT_500');};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){
   if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closedQuote=true;}}
   else cell+=c;
   continue;
  }
  if(c==='"'){
   if(closedQuote||cell.trim()!=='')throw Error('CSV_INVALID_QUOTES');
   cell='';quoted=true;continue;
  }
  if(c===',' ){endCell();continue;}
  if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;endLine();continue;}
  if(closedQuote&&c!==' '&&c!=='\t')throw Error('CSV_INVALID_QUOTES');
  cell+=c;
 }
 if(quoted)throw Error('CSV_UNCLOSED_QUOTE');
 endLine();
 const header=lines.shift()?.map(v=>v.toLowerCase())??[];
 if(!header.length||new Set(header).size!==header.length||header.some(h=>!importHeaders[kind].includes(h)))throw Error('CSV_INVALID_HEADERS');
 if(!lines.length||lines.length>500)throw Error('CSV_ROW_LIMIT_500');
 const rows=lines.map((values,index)=>{
  if(values.length>header.length)throw Error('ROW_'+(index+2)+': CSV_EXTRA_CELLS');
  return Object.fromEntries(header.map((h,i)=>[h,values[i]??'']));
 });
 validateImportRows(kind,rows);
 return rows;
}
