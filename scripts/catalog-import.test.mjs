import test from 'node:test';
import assert from 'node:assert/strict';
import {parseImportCsv,validateImportRow} from '../lib/catalog/import-csv.ts';
import {publicImageAddress} from '../lib/media/remote-image.ts';
test('CSV preserves multilingual quoted content and rejects invalid rows before writing',()=>{
 const rows=parseImportCsv('\uFEFFname,name_en,description,image_1\r\n"قسم, واحد",Category,"سطر\nثان",https://example.com/image.jpg','categories');assert.equal(rows[0].name,'قسم, واحد');assert.equal(rows[0].description,'سطر\nثان');
 for(const csv of ['name,name\nx,y','name,unknown\nx,y','name\n"unclosed'])assert.throws(()=>parseImportCsv(csv,'categories'));
 assert.throws(()=>validateImportRow('items',{category:'القسم',name:'صنف',price:'1.001'}));assert.throws(()=>validateImportRow('categories',{name:'قسم',image_1:'http://example.com/a.png'}));assert.throws(()=>validateImportRow('categories',{name:'قسم',image_1:'https://user:pass@example.com/a.png'}));assert.throws(()=>parseImportCsv('name\n'+Array(501).fill('قسم').join('\n'),'categories'));
});
test('remote image downloads fail closed on private, metadata, reserved and IPv6 addresses',()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','172.16.0.1','172.31.255.255','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','198.18.0.1','::1','::ffff:127.0.0.1'])assert.equal(publicImageAddress(ip),false,ip);
 assert.equal(publicImageAddress('8.8.8.8'),true);assert.equal(publicImageAddress('1.1.1.1'),true);
});
