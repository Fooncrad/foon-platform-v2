import type {Metadata} from "next";
import LegalPublicPage from "@/app/legal-public-page";
export const metadata:Metadata={title:"Terms and Conditions | FOON / NFOOD"};
export default function Terms(){return <LegalPublicPage kind="terms"/>;}
