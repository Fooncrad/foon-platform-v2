"use client";
import BrandedQr from "@/app/components/branded-qr";
export default function StorefrontQr({slug,name,language,logo}:{slug:string;name:string;language:"ar"|"en"|"fr";logo?:string}){
 return <BrandedQr scope="store" slug={slug} title={name} language={language} logo={logo}/>;
}
