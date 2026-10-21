import test from 'node:test';
import assert from 'node:assert/strict';
import {parseImportCsv,validateImportRow,validateImportRows} from '../lib/catalog/import-csv.ts';
import {publicImageAddress} from '../lib/media/remote-image.ts';
import {formatImportError} from '../lib/catalog/import-errors.ts';
test('CSV preserves multilingual quoted content and rejects invalid rows before writing',()=>{
 const rows=parseImportCsv('\uFEFFname,name_en,description,image_1\r\n"قسم, واحد",Category,"سطر\nثان",https://example.com/image.jpg','categories');assert.equal(rows[0].name,'قسم, واحد');assert.equal(rows[0].description,'سطر\nثان');
 for(const csv of ['name,name\nx,y','name,unknown\nx,y','name\n"unclosed'])assert.throws(()=>parseImportCsv(csv,'categories'));
 assert.throws(()=>validateImportRow('items',{category:'القسم',name:'صنف',price:'1.001'}));assert.throws(()=>validateImportRow('categories',{name:'قسم',image_1:'http://example.com/a.png'}));assert.throws(()=>validateImportRow('categories',{name:'قسم',image_1:'https://user:pass@example.com/a.png'}));assert.throws(()=>parseImportCsv('name\n'+Array(501).fill('قسم').join('\n'),'categories'));
});
test('remote image downloads fail closed on private, metadata, reserved and IPv6 addresses',()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','172.16.0.1','172.31.255.255','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','198.18.0.1','::1','::ffff:127.0.0.1'])assert.equal(publicImageAddress(ip),false,ip);
 assert.equal(publicImageAddress('8.8.8.8'),true);assert.equal(publicImageAddress('1.1.1.1'),true);
});


test('CSV parser rejects malformed quotes before any network import',()=>{
 for(const csv of [
  'name\\nاسم"غير صحيح',
  'name\\n"اسم مغلق"غير صالح',
  'name,description\\n"اسم","وصف"حرف',
  'name\\n"اسم بدون نهاية'
 ])assert.throws(()=>parseImportCsv(csv.replaceAll('\\n','\n'),'categories'),/CSV_(INVALID_QUOTES|UNCLOSED_QUOTE)/);
 const csv='name,description\\n"القهوة ""المميزة""","وصف, مفصل"';
 const rows=parseImportCsv(csv.replaceAll('\\n','\n'),'categories');
 assert.equal(rows[0].name,'القهوة "المميزة"');
 assert.equal(rows[0].description,'وصف, مفصل');
});
test('duplicate Arabic references anywhere in 500-row CSV are rejected before chunking',()=>{
 assert.throws(()=>parseImportCsv('name\nقسم\nقسم','categories'),/ROW_3: DUPLICATE_CSV_REFERENCE_ROW_2/);
 assert.throws(()=>parseImportCsv('category,name,price\nمشروبات,قهوة,9.00\nمشروبات,قهوة,10.00','items'),/ROW_3: DUPLICATE_CSV_REFERENCE_ROW_2/);
 const valid=parseImportCsv('category,name,price\nمشروبات,قهوة,9.00\nحلويات,قهوة,10.00','items');
 assert.equal(valid.length,2);
});
test('variant combinations detect reordered options even when their SKU differs',()=>{
 const a={category:'ملابس',product:'قميص',options:'اللون=أحمر|المقاس=كبير',sku:'RED-L',stock:'1'};
 const b={category:'ملابس',product:'قميص',options:'المقاس=كبير|اللون=أحمر',sku:'DUPLICATE',stock:'2'};
 assert.throws(()=>validateImportRows('variants',[a,b]),/ROW_3: DUPLICATE_CSV_REFERENCE_ROW_2/);
 assert.doesNotThrow(()=>validateImportRows('variants',[a,{...b,options:'المقاس=صغير|اللون=أحمر'}]));
});
test('server-side batch validation catches invalid columns and repeats',()=>{
 assert.throws(()=>validateImportRows('categories',[{name:'قسم'}, {name:'قسم'}]),/DUPLICATE_CSV_REFERENCE/);
 assert.throws(()=>validateImportRows('items',[{category:'قسم',name:'صنف',price:'10.001'}]),/ROW_2: INVALID_PRICE_PRECISION/);
});

test('owner-selected category fills missing CSV references but never overrides explicit categories',()=>{
 assert.throws(()=>parseImportCsv('name,price\\nقميص,25','items'),/ROW_2: REQUIRED_category/);
 const rows=parseImportCsv('name,price\\nقميص,25','items',{defaultCategory:'ملابس'});
 assert.deepEqual(rows,[{name:'قميص',price:'25',category:'ملابس'}]);
 const mixed=parseImportCsv('category,name,price\\n,قميص,25\\nإكسسوارات,حقيبة,50','items',{defaultCategory:'ملابس'});
 assert.deepEqual(mixed.map(row=>row.category),['ملابس','إكسسوارات']);
 assert.throws(()=>parseImportCsv('name,price\\nقميص,25','items',{defaultCategory:' '}),/REQUIRED_category/);
 assert.deepEqual(parseImportCsv('name\\nملابس','categories',{defaultCategory:'تجاهل'}),[{name:'ملابس'}]);
});
test('CSV row errors are translated and correctly offset across 5-row batches',()=>{
 const ar=formatImportError('ROW_2: REQUIRED_category','ar',5);
 assert.match(ar,/الصف 7:/);assert.match(ar,/اسم القسم مطلوب/);assert.match(ar,/ROW_7: REQUIRED_category/);
 assert.match(formatImportError('ROW_3: DUPLICATE_CSV_REFERENCE_ROW_2','en'),/Row 3: Duplicate entry/);
 assert.match(formatImportError('PLAN_FEATURE_REQUIRED','fr'),/abonnement/);
 assert.match(formatImportError('CSV_INVALID_HEADERS','ar'),/أعمدة الملف/);
});
