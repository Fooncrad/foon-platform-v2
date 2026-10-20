export type PublicPageLink={slug:string;title:string;titleEn?:string;titleFr?:string};
export type PublicFooterLanguage="ar"|"en"|"fr";
const reserved=new Set(["customer","market","account","billing","subscription","login","register","admin","checkout","pricing"]);
export function uniquePublicFooterPages(pages:readonly PublicPageLink[]):PublicPageLink[]{
 const slugs=new Set<string>(),titles=new Set<string>();
 return pages.filter(page=>{
  const slug=page.slug.normalize("NFKC").trim(),title=page.title.normalize("NFKC").trim();
  const key=slug.toLocaleLowerCase(),label=title.toLocaleLowerCase();
  if(!slug||!title||reserved.has(key)||slug.includes("/")||slug.includes("\\")||slug==="."||slug===".."||slugs.has(key)||titles.has(label))return false;
  slugs.add(key);titles.add(label);return true;
 });
}

/** Keep the published footer labels in the current UI language. Missing translations fall back to Arabic. */
export function localizedPublicFooterPages(pages:readonly PublicPageLink[],language:PublicFooterLanguage):PublicPageLink[]{
 const localized=pages.map(page=>({...page,title:(language==="en"?page.titleEn:language==="fr"?page.titleFr:page.title)?.trim()||page.title}));
 return uniquePublicFooterPages(localized);
}

/** Keep explicit CMS permalink language when navigating between published pages. */
export function publicContentPageHref(slug:string,language?:PublicFooterLanguage):string{
 const path="/p/"+encodeURIComponent(slug);
 return language?path+"?lang="+language:path;
}
