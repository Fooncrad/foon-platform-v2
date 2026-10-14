import "./globals.css";
import "./action-card-effects.css";
import "./experience.css";
import {cookies} from "next/headers";
export const metadata={title:"FOON",description:"FOON multi-tenant commerce platform"};
export default async function RootLayout({children}:{children:React.ReactNode}){
 const stored=(await cookies()).get("foon_language")?.value;
 const language=stored==="en"||stored==="fr"?stored:"ar";
 return <html lang={language} dir={language==="ar"?"rtl":"ltr"}><body>{children}</body></html>;
}
