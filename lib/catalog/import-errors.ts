import type {ImportKind} from './import-csv';
export type ImportLanguage='ar'|'en'|'fr';
const dictionary:Record<string,[string,string,string]>={
 REQUIRED_category:['اسم القسم مطلوب؛ اختر القسم من القائمة أو املأ عمود category.','Category is required; select an existing category or fill the category column.','La catégorie est obligatoire ; choisissez une catégorie ou renseignez la colonne category.'],
 REQUIRED_name:['اسم العنصر مطلوب.','Item name is required.','Le nom est obligatoire.'],
 REQUIRED_price:['السعر مطلوب.','Price is required.','Le prix est obligatoire.'],
 REQUIRED_product:['اسم المنتج المرجعي مطلوب.','Product reference is required.','La référence du produit est obligatoire.'],
 REQUIRED_group:['اسم مجموعة الخيارات مطلوب.','Option group is required.','Le groupe d’options est obligatoire.'],
 REQUIRED_options:['تركيبة الخيارات مطلوبة.','Option combination is required.','La combinaison d’options est obligatoire.'],
 REFERENCE_NOT_FOUND:['لم يُعثر على القسم أو المنتج أو المجموعة بالاسم العربي المحدد داخل هذا المتجر.','Referenced category, product or group was not found by its Arabic name in this store.','Catégorie, produit ou groupe introuvable sous ce nom arabe dans cette boutique.'],
 AMBIGUOUS_REFERENCE:['يوجد أكثر من مرجع مطابق؛ اجعل الاسم فريدًا داخل المتجر.','More than one reference matches; use unique names.','Plusieurs références correspondent ; utilisez des noms uniques.'],
 CSV_INVALID_HEADERS:['أعمدة الملف غير صحيحة؛ نزّل القالب لهذا القسم واستخدم أسماء الأعمدة الإنجليزية المحددة.','CSV columns are invalid; use this section’s template with its English column names.','Colonnes CSV invalides ; utilisez le modèle de cette section.'],
 CSV_EXTRA_CELLS:['عدد القيم أكبر من عدد الأعمدة؛ تأكد من وضع علامات اقتباس حول النصوص التي تحتوي فواصل.','More values than columns; quote fields containing commas.','Trop de valeurs ; mettez les champs contenant des virgules entre guillemets.'],
 CSV_ROW_LIMIT_500:['الملف يجب أن يحتوي من 1 إلى 500 صف بيانات.','The file must contain 1–500 data rows.','Le fichier doit contenir 1 à 500 lignes.'],
 CSV_TOO_LARGE:['الملف أكبر من الحجم المسموح (1 ميغابايت).','The file exceeds 1 MB.','Le fichier dépasse 1 Mo.'],
 CSV_INVALID_QUOTES:['صيغة علامات الاقتباس في CSV غير صحيحة.','CSV quotation format is invalid.','Guillemets CSV invalides.'],
 CSV_UNCLOSED_QUOTE:['هناك علامة اقتباس غير مغلقة في CSV.','A quotation mark is not closed.','Un guillemet CSV n’est pas fermé.'],
 INVALID_PRICE_PRECISION:['السعر يقبل منزلتين عشريتين كحد أقصى.','Prices allow at most two decimal places.','Deux décimales au maximum pour le prix.'],
 CATEGORY_EXISTS:['القسم موجود مسبقًا في هذا المتجر.','Category already exists in this store.','Cette catégorie existe déjà.'],
 ITEM_EXISTS:['المنتج موجود مسبقًا في هذا القسم.','Product already exists in this category.','Ce produit existe déjà dans cette catégorie.'],
 GROUP_EXISTS:['مجموعة الخيارات موجودة مسبقًا.','Option group already exists.','Ce groupe d’options existe déjà.'],
 VALUE_EXISTS:['قيمة الخيار موجودة مسبقًا.','Option value already exists.','Cette valeur d’option existe déjà.'],
 DUPLICATE_SKU_OR_COMBINATION:['رمز SKU أو تركيبة الخيارات مكررة.','SKU or option combination already exists.','SKU ou combinaison déjà existants.'],
 PLAN_FEATURE_REQUIRED:['هذه الميزة غير مفعلة في باقة المتجر؛ راجع إدارة الاشتراك.','This feature is not included in the store’s plan.','Cette fonction n’est pas comprise dans l’abonnement.'],
 PLAN_LIMIT_REACHED:['تم تجاوز الحد المسموح في الباقة.','Your plan limit has been reached.','Limite de l’abonnement atteinte.'],
 FORBIDDEN:['ليس لديك صلاحية الاستيراد أو يلزم فتح قفل الفروع.','Import is not permitted or a branch lock must be unlocked.','Import non autorisé ou verrou de succursale actif.'],
 UNAUTHENTICATED:['انتهت الجلسة؛ سجّل الدخول مجددًا.','Your session expired; sign in again.','Session expirée ; reconnectez-vous.'],
 INVALID_OR_UNREACHABLE_IMAGE:['تعذر استيراد صورة؛ تأكد من رابط HTTPS المباشر أو أزل رابط الصورة.','An image could not be imported; check its direct HTTPS link or remove it.','Une image est inaccessible ; vérifiez le lien HTTPS direct.'],
 STORAGE_LIMIT_REACHED:['امتلأت مساحة تخزين الصور المخصصة للحساب.','Your account image storage limit was reached.','Limite de stockage d’images atteinte.'],
 IMPORT_FAILED:['تعذر استيراد الدفعة؛ لم تُحفظ عناصرها. أعد المحاولة أو أرسل المرجع للدعم.','This batch failed and none of its entries were saved. Retry or share the reference with support.','Échec du lot ; aucune de ses entrées n’a été sauvegardée.'],
};
const index:Record<ImportLanguage,number>={ar:0,en:1,fr:2};
/** Keep the original technical code for maintenance without showing an untranslated error alone. */
export function formatImportError(raw:string,language:ImportLanguage='ar',rowOffset=0):string{
 const code=String(raw||'IMPORT_FAILED');
 const match=/^ROW_(\\d+):\\s*(.*)$/.exec(code);
 const reason=match?.[2]??code;
 const normalized=reason.startsWith('DUPLICATE_CSV_REFERENCE_ROW_')?'DUPLICATE_CSV_REFERENCE':reason;
 const reasonText=dictionary[normalized]?.[index[language]]??
  (normalized==='DUPLICATE_CSV_REFERENCE'?['تكرر نفس المرجع في صف آخر من الملف.','Duplicate entry appears elsewhere in this file.','Entrée en double dans le fichier.'][index[language]]:
   normalized.startsWith('INVALID_')?['إحدى القيم غير صالحة؛ راجع تنسيق الصف.','A value is invalid; check the row format.','Une valeur est incorrecte ; vérifiez la ligne.'][index[language]]:
   ['تعذر إكمال الاستيراد.','Could not complete the import.','Impossible de terminer l’import.'][index[language]]);
 const row=match?(['الصف ','Row ','Ligne '][index[language]]+(Number(match[1])+rowOffset)+': '):'';
 const reference=match?'ROW_'+(Number(match[1])+rowOffset)+': '+reason:code;
 return row+reasonText+' ['+reference+']';
}
