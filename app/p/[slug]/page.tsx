import {notFound} from "next/navigation";
import {cookies} from "next/headers";
import type {Metadata} from "next";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {publicFooterPages} from "@/lib/platform/public-footer-pages";
import {PublicMarketShell,PublicSiteHeader,PublicSiteFooter} from "@/app/public-site-chrome";
import {resolvePublicContentLanguage,publicContentText,type PublicContentLanguage} from "@/lib/ux/public-content-locale";
type Props={params:Promise<{slug:string}>;searchParams:Promise<{lang?:string}>};
const validSlug=(slug:string)=>/^[a-z][a-z0-9-]{1,119}$/.test(slug);
async function readPage(slug:string){
 if(!validSlug(slug))return null;
 const [rows]=await database().execute<RowDataPacket[]>(
  "SELECT title_ar,title_en,title_fr,body_ar,body_en,body_fr FROM platform_content_pages WHERE slug=? AND status='published' LIMIT 1",
  [slug]
 );
 return rows[0]??null;
}
async function contentLanguage(value:unknown):Promise<PublicContentLanguage>{
 const saved=(await cookies()).get("foon_language")?.value;
 return resolvePublicContentLanguage(value,saved);
}
export async function generateMetadata({params,searchParams}:Props):Promise<Metadata>{
 const [{slug},query]=await Promise.all([params,searchParams]);
 const page=await readPage(slug),language=await contentLanguage(query.lang);
 return {title:page?publicContentText(page,"title",language):"الصفحة غير موجودة"};
}
export default async function PublicContentPage({params,searchParams}:Props){
 const [{slug},query]=await Promise.all([params,searchParams]);
 const [page,language]=await Promise.all([readPage(slug),contentLanguage(query.lang)]);
 if(!page)notFound();
 const title=String(page["title_"+language]||page.title_ar);
 const body=publicContentText(page,"body",language);
 return <PublicMarketShell languageOverride={language} className="foonPublicContent">
  <PublicSiteHeader languageOverride={language}/>
  <main className="publicContentPage" lang={language} dir={language==="ar"?"rtl":"ltr"}>
   <article><h1>{title}</h1><div className="publicContentBody">{body}</div></article>
  </main>
  <PublicSiteFooter languageOverride={language} pages={await publicFooterPages()}/>
 </PublicMarketShell>;
}
