import test from 'node:test';import assert from 'node:assert/strict';
import {uiText,uiCopy} from '../lib/i18n/ui-copy.ts';
import {referenceFeatures} from '../lib/plans/reference-catalog.ts';
import {resourceModules,fieldLabels} from './restaurant-resource-schema.mjs';
test('every resource module, field and status has English and French interface copy',()=>{
 const labels=new Set(Object.values(fieldLabels));for(const resourceModule of Object.values(resourceModules)){labels.add(resourceModule.label);for(const field of resourceModule.fields)labels.add(field.label);}
 for(const language of ['en','fr'])for(const label of labels)assert.equal(/[\u0600-\u06ff]/.test(uiText(label,language)),false,language+': '+label);
});
test('copy is complete in both target languages and preserves Arabic and merchant content',()=>{
 for(const [arabic,translations]of Object.entries(uiCopy)){assert.equal(uiText(arabic,'ar'),arabic);assert.equal(translations.length,2);for(const translated of translations){assert.ok(translated.trim());assert.equal(/[\u0600-\u06ff]/.test(translated),false);}}
 assert.equal(uiText('متجر العميل الخاص','en'),'متجر العميل الخاص');assert.equal(uiText('My store','fr'),'My store');
});

test('seeded subscription features have English and French names',()=>{for(const [,label]of referenceFeatures)for(const language of ['en','fr'])assert.equal(/[\u0600-\u06ff]/.test(uiText(label,language)),false,language+': '+label);});
