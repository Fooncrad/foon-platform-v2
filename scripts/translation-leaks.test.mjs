import test from 'node:test';
import assert from 'node:assert/strict';
import {containsArabic,normalizeTranslationSource,translationLeakKey} from '../lib/i18n/translation-leaks.ts';

test('Arabic leakage detector identifies Arabic-script text and ignores English and French',()=>{
 assert.equal(containsArabic('Dashboard'),false);
 assert.equal(containsArabic('Tableau de bord'),false);
 assert.equal(containsArabic('إدارة المتاجر'),true);
 assert.equal(containsArabic('الطلبات  Orders'),true);
});

test('translation source keys are stable, normalized, and scoped to manual UI leak entries',()=>{
 assert.equal(normalizeTranslationSource('  إدارة   المتاجر  '),'إدارة المتاجر');
 assert.equal(translationLeakKey(' إدارة المتاجر '),translationLeakKey('إدارة   المتاجر'));
 assert.match(translationLeakKey('إدارة المتاجر'),/^ui\.leak\.[a-f0-9]{16}$/);
 assert.notEqual(translationLeakKey('إدارة المتاجر'),translationLeakKey('إدارة المطاعم'));
});
