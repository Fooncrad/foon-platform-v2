import {publicFooterPages} from "@/lib/platform/public-footer-pages";
import {PublicMarketShell,PublicSiteHeader,PublicSiteFooter} from "@/app/public-site-chrome";

/** Shared public account entry navigation; does not own auth/session logic. */
export default async function PublicAuthLayout({children}:{children:React.ReactNode}){
 const pages=await publicFooterPages();
 return <PublicMarketShell className="foonPublicJourney">
  <PublicSiteHeader/>
  {children}
  <PublicSiteFooter pages={pages}/>
 </PublicMarketShell>;
}
