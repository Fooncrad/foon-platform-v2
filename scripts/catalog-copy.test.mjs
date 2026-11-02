import test from 'node:test';
import assert from 'node:assert/strict';
import {CATALOG_COPY,catalogText} from '../lib/platform/catalog-copy.ts';
test('catalog labels have complete English and French copy and preserve Arabic sources',()=>{
 for(const [source,translations] of Object.entries(CATALOG_COPY)){
  assert.equal(catalogText(source,'ar'),source);
  for(const language of ['en','fr']){const value=catalogText(source,language);assert.ok(value.trim());assert.ok(!/[\u0600-\u06ff]/.test(value),source+':'+language);}
  assert.equal(translations.length,2);
 }
});
test('already displayed success and composite error messages translate without changing error codes',()=>{
 assert.equal(catalogText('تم تحديث العنصر.','en'),'Item updated.');
 assert.equal(catalogText('تعذر الحفظ: INVALID_PRICE','en'),'Could not save: INVALID_PRICE');
 assert.equal(catalogText('تعذر التحديث: خطأ غير معروف','fr'),'Mise à jour impossible : Erreur inconnue');
});
test('merchant content and prototype names remain unchanged',()=>{
 for(const value of ['POS product grocery','constructor','toString','SAR','7.25'])for(const language of ['ar','en','fr'])assert.equal(catalogText(value,language),value);
});
