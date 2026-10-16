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
export function parseImportCsv(input:string,kind:ImportKind):ImportRow[]{
 if(input.length>1000000)throw Error('CSV_TOO_LARGE');
 const lines:string[][]=[];let line:string[]=[],cell='',quoted=false;const text=input.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){line.push(cell.trim());cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;line.push(cell.trim());if(line.some(Boolean))lines.push(line);line=[];cell='';}else cell+=c;}
 if(quoted)throw Error('CSV_UNCLOSED_QUOTE');line.push(cell.trim());if(line.some(Boolean))lines.push(line);
 const header=lines.shift()?.map(v=>v.toLowerCase())??[];if(!header.length||new Set(header).size!==header.length||header.some(h=>!importHeaders[kind].includes(h)))throw Error('CSV_INVALID_HEADERS');
 if(!lines.length||lines.length>500)throw Error('CSV_ROW_LIMIT_500');
 return lines.map((values,index)=>{try{if(values.length>header.length)throw Error('CSV_EXTRA_CELLS');const row=Object.fromEntries(header.map((h,i)=>[h,values[i]??'']));validateImportRow(kind,row);return row;}catch(e){throw Error('ROW_'+(index+2)+': '+(e instanceof Error?e.message:'INVALID_ROW'));}});
}
