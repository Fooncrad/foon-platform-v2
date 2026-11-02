export type CatalogLanguage="ar"|"en"|"fr";
/** Stable Arabic source labels; locale changes affect UI only, never merchant data. */
export const CATALOG_COPY:Record<string,readonly [string,string]>={
 "تعذر تحميل الكتالوج. حاول مجددًا.":["Could not load the catalog. Please try again.","Impossible de charger le catalogue. Réessayez."],
 "أدخل سعرًا صالحًا لا يقل عن الصفر.":["Enter a valid price of zero or more.","Saisissez un prix valide supérieur ou égal à zéro."],
 "تمت الإضافة بنجاح.":["Added successfully.","Ajout effectué."],
 "تعذر الحفظ: ":["Could not save: ","Enregistrement impossible : "],
 "خطأ غير معروف":["Unknown error","Erreur inconnue"],
 "تم تحديث العنصر.":["Item updated.","Élément mis à jour."],
 "تعذر التحديث: ":["Could not update: ","Mise à jour impossible : "],
 "خطأ":["Error","Erreur"],
 "رابط الصورة HTTPS":["HTTPS image URL","URL HTTPS de l’image"],
 "أدخل رابط صورة HTTPS صالحًا بدون بيانات دخول.":["Enter a valid HTTPS image URL without credentials.","Saisissez une URL HTTPS d’image valide sans identifiants."],
 "تمت إضافة الصورة إلى المنتج.":["Image added to the product.","Image ajoutée au produit."],
 "تعذر إضافة الصورة: ":["Could not add image: ","Ajout de l’image impossible : "],
 "هل تريد حذف العنصر نهائيًا؟":["Permanently delete this item?","Supprimer définitivement cet élément ?"],
 "تم الحذف.":["Deleted.","Élément supprimé."],
 "تعذر الحذف: ":["Could not delete: ","Suppression impossible : "],
 "إدارة الخدمات":["Manage services","Gérer les services"],
 "قائمة المشروبات والمأكولات":["Drinks and food menu","Carte des boissons et plats"],
 "إدارة المنتجات":["Manage products","Gérer les produits"],
 "أضف أقسامًا ثم":["Add categories, then","Ajoutez des catégories, puis des"],
 "خدمات":["services","services"],"منتجات":["products","produits"],
 "تظهر في واجهة نشاطك.":["to display on your storefront.","à afficher sur votre vitrine."],
 "اسم القسم":["Category name","Nom de la catégorie"],
 "إضافة قسم":["Add category","Ajouter une catégorie"],
 "اسم الخدمة":["Service name","Nom du service"],
 "اسم المشروب أو الصنف":["Drink or item name","Nom de la boisson ou du plat"],
 "اسم المنتج":["Product name","Nom du produit"],
 "القسم":["Category","Catégorie"],"السعر (":["Price (","Prix ("],"السعر":["Price","Prix"],
 "الوصف":["Description","Description"],"إضافة":["Add","Ajouter"],
 "خدمة":["service","service"],"منتج":["product","produit"],"الأقسام":["Categories","Catégories"],
 "تعديل اسم القسم":["Edit category name","Modifier le nom de la catégorie"],
 "تعديل الاسم":["Edit name","Modifier le nom"],"إخفاء":["Hide","Masquer"],"إظهار":["Show","Afficher"],"حذف":["Delete","Supprimer"],
 "الأقسام:":["Categories:","Catégories :"],"الخدمات":["Services","Services"],"المنتجات":["Products","Produits"],
 "تعذر تحديث نتائج البحث. حاول مجددًا.":["Could not refresh search results. Please retry.","Impossible d’actualiser les résultats. Réessayez."],
 "بحث في الكتالوج":["Search catalog","Rechercher dans le catalogue"],
 "ابحث بالاسم بالعربية أو الإنجليزية أو الفرنسية":["Search names in Arabic, English or French","Rechercher un nom en arabe, anglais ou français"],
 "تصفية القسم":["Filter category","Filtrer par catégorie"],
 "تعذر تطبيق تصفية القسم. حاول مجددًا.":["Could not apply category filter. Please retry.","Impossible de filtrer par catégorie. Réessayez."],
 "جميع الأقسام":["All categories","Toutes les catégories"],"بحث":["Search","Rechercher"],"الاسم":["Name","Nom"],
 "السعر الجديد":["New price","Nouveau prix"],
 "كمية المخزون (اتركه فارغًا لغير المحدود)":["Stock quantity (leave empty for unlimited)","Quantité en stock (vide pour un stock illimité)"],
 "أدخل كمية مخزون صحيحة لا تقل عن الصفر.":["Enter a whole stock quantity of zero or more.","Saisissez une quantité entière supérieure ou égale à zéro."],
 "المخزون":["Stock","Stock"],"قسم ":["Category for ","Catégorie de "],
 "إضافة رابط صورة":["Add image URL","Ajouter une URL d’image"],
 "صفحات الكتالوج":["Catalog pages","Pages du catalogue"],
 "تعذر تحميل الصفحة السابقة.":["Could not load the previous page.","Impossible de charger la page précédente."],
 "السابق":["Previous","Précédente"],"صفحة":["Page","Page"],"من":["of","sur"],
 "تعذر تحميل الصفحة التالية.":["Could not load the next page.","Impossible de charger la page suivante."],
 "التالي":["Next","Suivante"]
};
export function catalogText(source:string,language:CatalogLanguage):string{
 if(language==="ar")return source;
 const copy=Object.hasOwn(CATALOG_COPY,source)?CATALOG_COPY[source]:undefined;
 if(copy)return copy[language==="en"?0:1];
 // Messages keep their source text in state so changing language also translates
 // already displayed success/error messages without changing entered data.
 for(const [prefix,translations] of Object.entries(CATALOG_COPY))if(prefix.endsWith(": ")&&source.startsWith(prefix))return translations[language==="en"?0:1]+catalogText(source.slice(prefix.length),language);
 return source;
}
