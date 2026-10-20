export type PublicPageLink={slug:string;title:string};
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
