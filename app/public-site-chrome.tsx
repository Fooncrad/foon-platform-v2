"use client";
import Link from "next/link";
import {useUiLanguage} from "@/lib/i18n/ui-language";
import {useSavedPreference} from "@/lib/ui/saved-preference";
import LanguageSelector from "@/app/components/language-selector";
import {uniquePublicFooterPages,type PublicPageLink} from "@/lib/ux/public-site-links";
type Theme="light"|"dark";
type Locale="ar"|"en"|"fr";
const labels:Record<Locale,{brand:string;market:string;features:string;plans:string;how:string;login:string;register:string;customer:string;footer:string;theme:string;footerNav:string;mainNav:string}>={
 ar:{brand:"الصفحة الرئيسية لمنصة FOON",market:"استكشف السوق",features:"المميزات",plans:"الباقات",how:"كيف تعمل",login:"حسابي / دخول",register:"ابدأ مجانًا",customer:"حساب العميل",footer:"منصة تشغيل حديثة للأعمال",theme:"تبديل المظهر",footerNav:"روابط الموقع",mainNav:"القائمة الرئيسية"},
 en:{brand:"FOON platform home",market:"Explore marketplace",features:"Features",plans:"Plans",how:"How it works",login:"My account / Sign in",register:"Get started free",customer:"Customer account",footer:"A modern business operating platform",theme:"Toggle appearance",footerNav:"Site links",mainNav:"Main navigation"},
 fr:{brand:"Accueil de la plateforme FOON",market:"Explorer le marché",features:"Fonctionnalités",plans:"Offres",how:"Comment ça marche",login:"Mon compte / Connexion",register:"Commencer gratuitement",customer:"Espace client",footer:"Une plateforme moderne pour les entreprises",theme:"Changer l’apparence",footerNav:"Liens du site",mainNav:"Navigation principale"}
};
export function PublicSiteHeader({home=false,plans=false}:{home?:boolean;plans?:boolean}){
 const language=useUiLanguage(),t=labels[language];
 const [theme,setTheme]=useSavedPreference<Theme>("foon-public-theme",["light","dark"],"light",true);
 const toggle=()=>setTheme(theme==="light"?"dark":"light");
 return <header className="foonPublicHeader"><Link className="foonPublicBrand" href="/" aria-label={t.brand}><span className="foonBrandMark">F</span><span>FOON<small>PLATFORM</small></span></Link>
  <nav aria-label={t.mainNav}><Link href="/market">{t.market}</Link><Link href={home?"#features":"/#features"}>{t.features}</Link>{plans&&<Link href={home?"#plans":"/#plans"}>{t.plans}</Link>}<Link href={home?"#how":"/#how"}>{t.how}</Link></nav>
  <div className="foonPublicControls"><LanguageSelector className="foonLanguageControl"/><button className="foonThemeControl" type="button" onClick={toggle} aria-label={t.theme} aria-pressed={theme==="dark"}>{theme==="light"?"☾":"☀"}</button><Link className="foonLogin" href="/login">{t.login}</Link><Link className="foonHeaderCta" href="/register">{t.register}</Link></div>
 </header>;
}
export function PublicSiteFooter({pages=[]}:{pages?:PublicPageLink[]}){
 const language=useUiLanguage(),t=labels[language];
 return <footer className="foonPublicFooter"><div><strong>FOON</strong><p>{t.footer}</p></div><nav aria-label={t.footerNav}><Link href="/market">{t.market}</Link><Link href="/customer">{t.customer}</Link>{uniquePublicFooterPages(pages).map(p=><Link href={`/p/${encodeURIComponent(p.slug)}`} key={p.slug}>{p.title}</Link>)}</nav><small>© FOON</small></footer>;
}
export function PublicMarketShell({children}:{children:React.ReactNode}){
 const language=useUiLanguage();
 const [theme]=useSavedPreference<Theme>("foon-public-theme",["light","dark"],"light",true);
 return <div className="foonPublic foonPublicMarket" data-theme={theme} dir={language==="ar"?"rtl":"ltr"}>{children}</div>;
}
