"use client";
import BrandedQr from "@/app/components/branded-qr";
export default function StorefrontQr({slug,name,language}:{slug:string;name:string;language:"ar"|"en"|"fr"}){
 return <BrandedQr scope="store" slug={slug} title={name} language={language}/>;
}
