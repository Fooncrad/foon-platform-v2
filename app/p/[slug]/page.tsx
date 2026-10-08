import {notFound} from "next/navigation";
import type {Metadata} from "next";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
type Props={params:Promise<{slug:string}>;searchParams:Promise<{lang?:string}>};
async function readPage(slug:string){const [rows]=await database().execute<RowDataPacket[]>("SELECT title_ar,title_en,title_fr,body_ar,body_en,body_fr FROM platform_content_pages WHERE slug=? AND status='published' LIMIT 1",[slug]);return rows[0]??null;}
export async function generateMetadata({params}:Props):Promise<Metadata>{const {slug}=await params;const page=await readPage(slug);return {title:page?String(page.title_ar):"الصفحة غير موجودة"};}
export default async function PublicContentPage({params,searchParams}:Props){
 const {slug}=await params,{lang}=await searchParams;
 if(!/^[a-z][a-z0-9-]{1,119}$/.test(slug))notFound();
 const page=await readPage(slug);if(!page)notFound();
 const locale=lang==="en"||lang==="fr"?lang:"ar";
 const title=String(page["title_"+locale]),body=String(page["body_"+locale]);
 return <main className="publicContentPage" lang={locale} dir={locale==="ar"?"rtl":"ltr"}><article><a className="publicContentBrand" href="/">FOON</a><h1>{title}</h1><div className="publicContentBody">{body}</div></article></main>;
}
