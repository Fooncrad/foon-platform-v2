import "./globals.css";
import "./experience.css";
import PwaSupport from './pwa-support';
export const metadata={title:"FOON",description:"FOON multi-tenant commerce platform",manifest:'/manifest.webmanifest',appleWebApp:{capable:true,title:'FOON',statusBarStyle:'default'},icons:{apple:'/pwa/icon-192.png'}};
export const viewport={themeColor:'#111c2e'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body><PwaSupport/>{children}</body></html>}
