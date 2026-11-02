import type {CreatorSocialPlatform} from "@/lib/creator/social-links";
export default function CreatorSocialIcon({platform}:{platform:CreatorSocialPlatform}){
 const common={width:22,height:22,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.9,strokeLinecap:"round" as const,strokeLinejoin:"round" as const,"aria-hidden":true as const};
 switch(platform){
  case "instagram":return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.6" r="1" fill="currentColor" stroke="none"/></svg>;
  case "tiktok":return <svg {...common}><path d="M14 3v12.5a4.5 4.5 0 1 1-4.5-4.5"/><path d="M14 3c.5 3.5 3.2 5.5 6.5 5.5"/></svg>;
  case "snapchat":return <svg {...common}><path d="M8 7a4 4 0 0 1 8 0v4c.6 1 1.5 1.5 3 1.5-.2 1.3-1.3 2.2-2.8 2.7-.4.9-.4 1.8-1.5 2-1.1-.2-1.9-.4-2.7.8-.8-1.2-1.6-1-2.7-.8-1.1-.2-1.1-1.1-1.5-2-1.5-.5-2.6-1.4-2.8-2.7 1.5 0 2.4-.5 3-1.5V7Z"/></svg>;
  case "youtube":return <svg {...common}><rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="m10 9 5 3-5 3Z" fill="currentColor" stroke="none"/></svg>;
  case "x":return <svg {...common}><path d="M4 3.5 20 20.5M20 3.5 4 20.5"/><path d="M4 3.5h4l12 17h-4l-12-17Z" fill="currentColor" stroke="none"/></svg>;
  case "facebook":return <svg {...common}><path d="M14 21V12h4l.6-4H14V6c0-1.4.5-2 2-2h3V1h-3.7C11.8 1 10 3 10 6v2H7v4h3v9Z"/></svg>;
  case "whatsapp":return <svg {...common}><path d="M20 11.5a8 8 0 0 1-11.3 7.3L4 20l1.2-4.7A8 8 0 1 1 20 11.5Z"/><path d="M9 8.5c.8 3 2 4.4 5.5 6l1.3-1.3"/></svg>;
  case "telegram":return <svg {...common}><path d="m3 11 17-7-4.5 16-4.3-5.8L8 18v-5.1L20 4"/><path d="m8 13 3.2 1.2"/></svg>;
  case "threads":return <svg {...common}><path d="M17.6 9.4c-.7-3.7-3-5.5-6.4-5.5-4.5 0-7 3.2-7 8.1S6.7 20 11 20c4.3 0 7-2.6 7-5.5 0-2.1-1.8-3.8-4.7-3.8-3.3 0-5 1.4-5 3.5 0 1.4.9 2.2 2.4 2.2 2.2 0 3.4-1.9 2.8-5.1"/></svg>;
  case "linkedin":return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="7.7" cy="8" r="1" fill="currentColor"/><path d="M8 11v6m4-6v6m0-4.2c0-2.4 5-3 5 .5V17"/></svg>;
  case "pinterest":return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M9 19c1-3 2-6 3-9M10.5 14c1.5 1 5 .4 5.7-2.8.6-3-1.4-4.5-4.2-4.5-4 0-6 3.6-4.7 6"/></svg>;
  case "website":return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18m-9-9c-5 5-5 13 0 18m0-18c5 5 5 13 0 18M5 7h14M5 17h14"/></svg>;
 }
}
