import Link from "next/link";
import {cookies} from "next/headers";
import {notFound} from "next/navigation";
import {database} from "@/lib/db/mysql";
import type {RowDataPacket} from "mysql2/promise";
import {parseData} from "@/lib/restaurant/operations";
import {validStoreSlug} from "@/scripts/store-slug.mjs";
export default async function BusinessPolicy({params}:{params:Promise<{slug:string;policy:string}>}){
 const {slug,policy}=await params;if(!validStoreSlug(slug)||!["terms","refund","privacy"].includes(policy))notFound();
 const [rows]=await database().execute<RowDataPacket[]>("SELECT t.name,r.data FROM tenants t JOIN restaurant_resources r ON r.tenant_id=t.id AND r.kind='storefront_config' AND r.archived=FALSE AND r.status='active' WHERE t.slug=? AND t.status='active' LIMIT 1",[slug]);if(!rows.length)notFound();
 const locale=(await cookies()).get("foon_language")?.value,language=locale==="en"||locale==="fr"?locale:"ar";
 const content=parseData(rows[0].data)[policy+(language==="en"?"En":language==="fr"?"Fr":"")];if(typeof content!=="string"||!content.trim())notFound();
 const labels={terms:["الشروط والأحكام","Terms and conditions","Conditions générales"],refund:["الاسترجاع والاسترداد","Returns and refunds","Retours et remboursements"],privacy:["سياسة الخصوصية","Privacy policy","Politique de confidentialité"]};
 return <main dir={language==="ar"?"rtl":"ltr"} lang={language} style={{maxWidth:800,margin:"auto",padding:24,overflowWrap:"anywhere"}}><Link href={"/"+encodeURIComponent(slug)}>{String(rows[0].name)}</Link><h1>{labels[policy as keyof typeof labels][language==="ar"?0:language==="en"?1:2]}</h1><article style={{whiteSpace:"pre-wrap",lineHeight:1.9}}>{content}</article></main>;
}
