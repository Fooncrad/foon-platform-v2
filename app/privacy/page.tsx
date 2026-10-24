import type {Metadata} from "next";
import LegalPublicPage from "@/app/legal-public-page";
export const metadata:Metadata={title:"Privacy Policy | FOON / NFOOD"};
export default function Privacy(){return <LegalPublicPage kind="privacy"/>;}
