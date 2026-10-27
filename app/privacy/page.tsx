import type {Metadata} from "next";
import LegalPublicPage from "@/app/legal-public-page";
export const metadata:Metadata={title:"Privacy Policy | FOON / NFOOD"};
export default function Privacy({searchParams}:{searchParams:Promise<{lang?:string}>}){return <LegalPublicPage kind="privacy" searchParams={searchParams}/>;}
