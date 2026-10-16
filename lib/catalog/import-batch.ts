import {randomUUID} from 'node:crypto';
import type {PoolConnection,RowDataPacket} from 'mysql2/promise';
import {saveCanonicalMenu} from '@/lib/restaurant/menu';
import {combinationKey} from '@/lib/restaurant/activity-pos';
import {parseCatalogMeasurements} from '@/lib/platform/catalog-measurements';
import type {ImportKind,ImportRow} from './import-csv';
export async function importBatch(db:PoolConnection,tenant:string,actor:string,restaurant:boolean,activity:string,currency:string,kind:ImportKind,rows:ImportRow[],images:Map<string,string>){
 const ids:string[]=[];
 const find=async(table:string,column:string,name:string,extra='',values:string[]=[])=>{const [found]=await db.execute<RowDataPacket[]>('SELECT id FROM '+table+' WHERE tenant_id=? AND '+column+'=?'+extra+' LIMIT 2',[tenant,name,...values]);if(found.length!==1)throw Error(found.length?'AMBIGUOUS_REFERENCE':'REFERENCE_NOT_FOUND');return String(found[0].id);};
 for(const row of rows){
  if(restaurant&&kind==='items'&&(row.sku||row.unit&&row.unit!=='piece'||row.quantity_mode&&row.quantity_mode!=='whole'||['weight_kg','length_cm','width_cm','height_cm'].some(k=>row[k])))throw Error('RESTAURANT_MEASUREMENTS_NOT_SUPPORTED');
  if(restaurant&&kind==='values'&&row.stock)throw Error('OPTION_STOCK_NOT_SUPPORTED');
  const imageUrls=[row.image_1,row.image_2,row.image_3,row.image_4].filter(Boolean).map(u=>{const url=images.get(u);if(!url)throw Error('IMAGE_NOT_SAVED');return url;});
  const translated={nameEn:row.name_en||null,nameFr:row.name_fr||null,description:row.description||null,descriptionEn:row.description_en||null,descriptionFr:row.description_fr||null};
  if(kind==='categories'){
   const table=restaurant?'restaurant_menu_categories':'catalog_categories',column=restaurant?'name':'name_ar';const [exists]=await db.execute<RowDataPacket[]>('SELECT id FROM '+table+' WHERE tenant_id=? AND '+column+'=?',[tenant,row.name]);if(exists.length)throw Error('CATEGORY_EXISTS');
   if(restaurant){const result=await saveCanonicalMenu(db,tenant,actor,'categories',{name:row.name,status:'active',data:{...translated,imageUrl:imageUrls[0]??null}});ids.push(result.id);}
   else {const id=randomUUID();await db.execute('INSERT INTO catalog_categories(id,tenant_id,name_ar,name_en,name_fr,description_ar,description_en,description_fr,image_url) VALUES (?,?,?,?,?,?,?,?,?)',[id,tenant,row.name,row.name_en||null,row.name_fr||null,row.description||null,row.description_en||null,row.description_fr||null,imageUrls[0]??null]);ids.push(id);}
   continue;
  }
  const category=await find(restaurant?'restaurant_menu_categories':'catalog_categories',restaurant?'name':'name_ar',row.category,' AND enabled=TRUE');
  if(kind==='items'){
   const [existing]=await db.execute<RowDataPacket[]>('SELECT id FROM '+(restaurant?'restaurant_menu_items':'catalog_products')+' WHERE tenant_id=? AND category_id=? AND '+(restaurant?'name':'name_ar')+'=?',[tenant,category,row.name]);if(existing.length)throw Error('ITEM_EXISTS');
   if(restaurant){const result=await saveCanonicalMenu(db,tenant,actor,'menu',{name:row.name,status:'active',data:{...translated,categoryId:category,price:Number(row.price),quantity:row.stock?Number(row.stock):null,imageUrl:imageUrls[0]??null}});await db.execute('UPDATE restaurant_menu_items SET currency=? WHERE tenant_id=? AND id=?',[currency,tenant,result.id]);for(let i=0;i<imageUrls.length;i++)await db.execute('INSERT INTO restaurant_menu_item_images(id,tenant_id,item_id,image_url,sort_order) VALUES (?,?,?,?,?)',[randomUUID(),tenant,result.id,imageUrls[i],i]);ids.push(result.id);}
   else {const id=randomUUID();const measurements=row.unit?parseCatalogMeasurements({unit:row.unit,quantityMode:row.quantity_mode||'whole',weightKg:row.weight_kg?Number(row.weight_kg):null,lengthCm:row.length_cm?Number(row.length_cm):null,widthCm:row.width_cm?Number(row.width_cm):null,heightCm:row.height_cm?Number(row.height_cm):null}):null;
    await db.execute('INSERT INTO catalog_products(id,tenant_id,category_id,product_type,sku,name_ar,name_en,name_fr,description_ar,description_en,description_fr,price,currency,stock_quantity,attributes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[id,tenant,category,['carwash','laundry','automotive','salon','publicworks'].includes(activity)?'service':activity==='cafe'||activity==='sweets'?'food':'physical',row.sku||null,row.name,row.name_en||null,row.name_fr||null,row.description||null,row.description_en||null,row.description_fr||null,Number(row.price),currency,row.stock?Number(row.stock):null,measurements?JSON.stringify({measurements}):null]);for(let i=0;i<imageUrls.length;i++)await db.execute('INSERT INTO catalog_images(id,tenant_id,product_id,image_url,sort_order) VALUES (?,?,?,?,?)',[randomUUID(),tenant,id,imageUrls[i],i]);ids.push(id);
   }continue;
  }
  const product=await find(restaurant?'restaurant_menu_items':'catalog_products',restaurant?'name':'name_ar',row.product,' AND category_id=? AND enabled=TRUE',[category]);
  const groupTable=restaurant?'restaurant_menu_option_groups':'catalog_option_groups',productColumn=restaurant?'item_id':'product_id';
  if(kind==='groups'){
   const [groups]=await db.execute<RowDataPacket[]>('SELECT id,'+(restaurant?'name':'name_ar')+' AS name FROM '+groupTable+' WHERE tenant_id=? AND '+productColumn+'=?',[tenant,product]);if(groups.length>=20)throw Error('GROUP_LIMIT');if(groups.some(g=>g.name===row.name))throw Error('GROUP_EXISTS');
   const selection=row.selection||'single',required=row.required==='yes',max=selection==='single'?1:Number(row.max||1);
   if(restaurant){const result=await saveCanonicalMenu(db,tenant,actor,'menuGroups',{name:row.name,status:'active',data:{nameEn:translated.nameEn,nameFr:translated.nameFr,itemId:product,selectionType:selection,requiredFlag:required?'yes':'no',minSelect:required?1:0,maxSelect:max}});ids.push(result.id);}
   else {const id=randomUUID();await db.execute('INSERT INTO catalog_option_groups(id,tenant_id,product_id,name_ar,name_en,name_fr,selection_type,required,min_select,max_select) VALUES (?,?,?,?,?,?,?,?,?,?)',[id,tenant,product,row.name,row.name_en||null,row.name_fr||null,selection,required,required?1:0,max]);ids.push(id);}continue;
  }
  if(kind==='values'){
   const group=await find(groupTable,restaurant?'name':'name_ar',row.group,' AND '+productColumn+'=? AND enabled=TRUE',[product]),table=restaurant?'restaurant_menu_option_values':'catalog_option_values';
   const [values]=await db.execute<RowDataPacket[]>('SELECT id,'+(restaurant?'name':'name_ar')+' AS name FROM '+table+' WHERE tenant_id=? AND group_id=?',[tenant,group]);if(values.length>=100)throw Error('VALUE_LIMIT');if(values.some(v=>v.name===row.name))throw Error('VALUE_EXISTS');
   if(restaurant){const result=await saveCanonicalMenu(db,tenant,actor,'menuValues',{name:row.name,status:'active',data:{nameEn:translated.nameEn,nameFr:translated.nameFr,groupId:group,priceDelta:Number(row.price||0),imageUrl:imageUrls[0]??null}});ids.push(result.id);}
   else {const id=randomUUID();await db.execute('INSERT INTO catalog_option_values(id,tenant_id,group_id,name_ar,name_en,name_fr,price_delta,stock_quantity,image_url) VALUES (?,?,?,?,?,?,?,?,?)',[id,tenant,group,row.name,row.name_en||null,row.name_fr||null,Number(row.price||0),row.stock?Number(row.stock):null,imageUrls[0]??null]);ids.push(id);}continue;
  }
  if(restaurant)throw Error('VARIANTS_NOT_APPLICABLE');
  const [groups]=await db.execute<RowDataPacket[]>('SELECT * FROM catalog_option_groups WHERE tenant_id=? AND product_id=? AND enabled=TRUE',[tenant,product]);
  const selected:string[]=[];
  for(const pair of row.options.split('|')){const parts=pair.split('=');if(parts.length!==2)throw Error('OPTIONS_USE_GROUP_EQUALS_VALUE');const group=groups.filter(g=>g.name_ar===parts[0].trim());if(group.length!==1)throw Error('GROUP_NOT_FOUND');const value=await find('catalog_option_values','name_ar',parts[1].trim(),' AND group_id=? AND enabled=TRUE',[String(group[0].id)]);selected.push(value);}
  if(!selected.length||selected.length>20||new Set(selected).size!==selected.length)throw Error('INVALID_OPTIONS');
  for(const group of groups){const [values]=await db.execute<RowDataPacket[]>('SELECT id FROM catalog_option_values WHERE tenant_id=? AND group_id=?',[tenant,group.id]);const count=values.filter(v=>selected.includes(String(v.id))).length;if(count<Number(group.min_select)||group.required&&count<1||count>(group.selection_type==='single'?1:Number(group.max_select)))throw Error('INVALID_OPTIONS');}
  const [[count]]=await db.execute<RowDataPacket[]>('SELECT COUNT(*) AS n FROM catalog_variants WHERE tenant_id=? AND product_id=?',[tenant,product]);if(Number(count.n)>=500)throw Error('VARIANT_LIMIT');
  const id=randomUUID();await db.execute('INSERT INTO catalog_variants(id,tenant_id,product_id,combination_key,option_ids,sku,stock_quantity) VALUES (?,?,?,?,?,?,?)',[id,tenant,product,combinationKey(selected),JSON.stringify(selected),row.sku||null,row.stock?Number(row.stock):null]);for(let i=0;i<imageUrls.length;i++)await db.execute('INSERT INTO catalog_variant_images(id,tenant_id,product_id,variant_id,image_url,sort_order) VALUES (?,?,?,?,?,?)',[randomUUID(),tenant,product,id,imageUrls[i],i]);ids.push(id);
 }
 return ids;
}
