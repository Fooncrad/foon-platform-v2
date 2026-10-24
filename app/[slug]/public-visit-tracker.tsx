"use client";
import PublicVisitTracker from "@/app/components/public-visit-tracker";
export default function StorefrontPublicVisitTracker({slug}:{slug:string}){
 return <PublicVisitTracker kind="storefront" slug={slug}/>;
}
